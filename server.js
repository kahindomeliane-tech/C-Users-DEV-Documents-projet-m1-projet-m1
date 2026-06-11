// --- Dépendances ---
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
// Rediriger la racine vers la page de connexion pour forcer l'authentification
app.get("/", (req, res) => {
    res.redirect("/login.html");
});
app.get("/index.html", (req, res) => {
    res.redirect("/login.html");
});
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

// --- Chiffrement AES-256 ---
const ENCRYPTION_KEY = crypto.randomBytes(32); // ⚠️ à mettre dans .env
function encryptMessage(message, pin) {
    const iv = crypto.randomBytes(16); // IV unique par message
    const securedMessage = `${pin}:${message}`;
    const cipher = crypto.createCipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(securedMessage, "utf8", "hex");
    encrypted += cipher.final("hex");
    return { encrypted, iv: iv.toString("hex") };
}

function decryptMessage(encryptedMessage, ivHex, pin) {
    try {
        const iv = Buffer.from(ivHex, "hex");
        const decipher = crypto.createDecipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
        let decrypted = decipher.update(encryptedMessage, "hex", "utf8");
        decrypted += decipher.final("utf8");

        const [storedPin, originalMessage] = decrypted.split(":", 2);
        return storedPin === pin ? originalMessage : "PIN incorrect";
    } catch {
        return "Erreur de déchiffrement";
    }
}

// --- Chat avec 5 groupes ---
io.on("connection", (socket) => {
    socket.on("joinGroup", ({ username, group }) => {
        socket.username = username;
        socket.group = group;
        socket.join(group);
        io.to(group).emit("system", `${username} a rejoint ${group}`);
    });

    socket.on("chat message", ({ group, message, pin }) => {
        const { encrypted, iv } = encryptMessage(message, pin);
        io.to(group).emit("chat message", { user: socket.username, text: encrypted, iv });
    });

    socket.on("disconnect", () => {
        if (socket.username && socket.group) {
            io.to(socket.group).emit("system", `${socket.username} a quitté ${socket.group}`);
        }
    });
});

// Écoute du serveur avec tentative sur un port alternatif si 3000 est occupé
const DEFAULT_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
function listenWithRetry(startPort, maxAttempts = 5) {
    let port = startPort;
    let attempts = 0;

    function tryListen() {
        server.listen(port, () => {
            console.log(`Serveur lancé sur http://localhost:${port}`);
        });

        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE' && attempts < maxAttempts) {
                console.warn(`Port ${port} occupé, tentative sur ${port + 1}...`);
                attempts++;
                port++;
                // remove previous listener to avoid multiple handlers
                server.removeAllListeners('error');
                tryListen();
            } else {
                console.error('Erreur serveur:', err);
                process.exit(1);
            }
        });
    }

    tryListen();
}

listenWithRetry(DEFAULT_PORT);
