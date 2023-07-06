const express = require("express");
const userRouter = require("./routes/user.routes");
const connectDatabase = require("./config/mongodb/db");
const app = express();
require("dotenv").config();
const fileUploader = require("express-fileupload");
const mysql = require("mysql");
const connectDB = require("./config/mysql/mysql");
const currencyRouter = require("./routes/currency.routes");
const cors = require("cors");
const multer = require("multer");
const bodyParser = require("body-parser");
const protect = require("./middlewares/userAuth");
const documentRouter = require("./routes/documents.routes");
const swaggerUi = require("swagger-ui-express");
const swaggerDocument = require("./swagger.json");

const conn = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "re_pro",
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// Fileuploader
app.use(
  fileUploader({
    useTempFiles: true,
    tempFileDir: "/tmp/",
  })
);

// Connect database
connectDatabase(); // MongoDB
connectDB(); // MySQL

// Swagger documentation

app.use("/documentation", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

/* Upload a document
   ----------------- */

// Multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "./uploads");
  },
  filename: function (req, file, cb) {
    const ext = file.originalname.split(".");
    const e = ext[ext.length - 1];
    // console.log(ext[ext.length-1])
    cb(null, `${file.originalname}.${e}`);
  },
});

// Upload a document
const upload = multer({ storage: storage }).single("file");

app.post("/api/docs/:user/create", protect, (req, res) => {
  if (!user) return res.status(400).send({ message: "User not found!" });
  if (user.name !== req.params.user)
    return res.status(404).send({ message: "Cannot perform this action!" });
  // upload a word document

  upload(req, res, (err) => {
    if (err) {
      console.log(err);
      return res.status(400).send({ message: "Error uploading file" });
    }

    // Save the link to database
    const path = __dirname + "\\" + req.file.path;
    const receiver = req.body.receiver;
    const reporter = req.params.user;
    const details = req.body.details;
    const subject = req.body.subject;
    const doc_name = Date.now() + req.file.originalname;
    const church = req.body.church;

    // console.log({path, receiver, reporter, details, subject})
    // save to database
    const sql = `INSERT INTO documents (receiver, reporter, details, subject, path, doc_name, church) VALUES ('${receiver}', '${reporter}', '${details}', '${subject}', '${path}', '${doc_name}', '${church}')`;
    conn.query(sql, (err, result) => {
      if (err) {
        console.log(err);
        return res.status(400).send({ message: "Error saving to database" });
      }
      const sql = `SELECT * FROM documents WHERE reporter='${user.name}'`;
      conn.query(sql, async (err, data) => {
        if (err)
          return res.status(500).send({ message: "Internal server error..." });
        if (data.length === 0)
          return res.status(400).send({ message: "Document not found!" });
        res.send({ doc: data, message: "File uploaded successfully" });
      });
    });
  });
});

/* ----------------------------------------------------------- */

/* Download the document */
app.get("/api/docs/:user/doc/:id/download", protect, (req, res) => {
  const sql = `SELECT * FROM documents WHERE id='${req.params.id}'`;
  conn.query(sql, (err, result) => {
    if (err) {
      console.log(err);
      return res.status(400).send({ message: "Error downloading file" });
    }
    if (result.length === 0)
      return res.status(400).send({ message: "Document not found!" });
    const path = result[0].path;
    return res.status(201).download(path);
  });
});

/* ---------------------------------------------------------------- */

app.use("/api/docs", documentRouter);

// Use cors
app.use(cors());

// user apis
app.use("/api/users", userRouter);

// Currency apis
app.use("/api/currency", currencyRouter);

// Room chat apis
app.use("/api/chat", require("./routes/chat.routes"));

const server = app.listen(process.env.PORT, () => {
  console.log(`server listening port ${process.env.PORT}`);
});

const { Server } = require("socket.io");
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

io.on("connection", (socket) => {
  console.log("connected");

  socket.on("setup", (userData) => {
    socket.join(userData._id);
    socket.emit("connected");
  });

  socket.on("join chat", (room) => {
    socket.join(room);
    console.log(`User joined room ${room}`);
  });

  socket.on("typing", (room) => socket.in(room).emit("typing"));

  socket.on("stop typing", (room) => socket.in(room).emit("stop typing"));

  socket.on("new message", (newMsgReceived) => {
    var chat = newMsgReceived.chat;

    if (!chat.users) return console.log("Chat users not defined!");
    chat.users.forEach((user) => {
      if (user._id === newMsgReceived.sender._id) return;
      socket.in(user._id).emit("message received", newMsgReceived);
    });

    socket.off("setup", (userData) => {
      console.log("disconnected");
      socket.leave(userData._id);
    });
  });
});
