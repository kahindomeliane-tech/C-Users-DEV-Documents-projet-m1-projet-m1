const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static("public"));

const upload = multer({ dest: "uploads/" });

let users = [];
let filesDB = {};

// --- Authentification ---
app.post("/register", (req, res) => {
    const { username, password } = req.body;
    const exist = users.find(u => u.username === username);
    if (exist) {
        return res.json({ success: false, message: "Utilisateur existe déjà" });
    }
    users.push({ username, password });
    res.json({ success: true });
});

app.post("/login", (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) {
        return res.json({ success: false, message: "Identifiants incorrects" });
    }
    res.json({ success: true, username });
});

// --- Upload ---
app.post("/upload", upload.single("file"), (req, res) => {
    const file = req.file;
    const fakeHash = file.originalname + "_" + file.size;
    if (!filesDB[fakeHash]) {
        filesDB[fakeHash] = { firstUploader: req.body.username };
    }
    res.json({
        success: true,
        fileName: file.originalname,
        firstUploader: filesDB[fakeHash].firstUploader
    });
});

// --- Chat avec 5 groupes ---
io.on("connection", (socket) => {
    socket.on("joinGroup", ({ username, group }) => {
        socket.username = username;
        socket.group = group;
        socket.join(group);
        io.to(group).emit("system", `${username} a rejoint ${group}`);
    });

    socket.on("chat message", ({ group, message }) => {
        io.to(group).emit("chat message", { user: socket.username, text: message });
    });

    socket.on("disconnect", () => {
        if (socket.username && socket.group) {
            io.to(socket.group).emit("system", `${socket.username} a quitté ${socket.group}`);
        }
    });
});

server.listen(3000, () => {
    console.log("Serveur lancé sur http://localhost:3000");
});
