// Connexion au serveur Socket.IO
const socket = io();

// Récupération du username depuis le localStorage
const username = localStorage.getItem("username");
if (!username) {
    window.location = "login.html";
}

// Référence vers la zone des messages
const messages = document.getElementById("messages");

// Fonction utilitaire pour ajouter un message dans la zone
function addMessage(html, className = "message") {
    const div = document.createElement("div");
    div.classList.add(className);
    div.innerHTML = html;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
}

// --- PIN utilisateur ---
let userPin = "";
function setPin() {
    userPin = localStorage.getItem("pin") || prompt("Entrez votre PIN de sécurité :");
    localStorage.setItem("pin", userPin);
}

// --- Gestion des groupes ---
function joinGroup() {
    const group = document.getElementById("group").value;
    socket.emit("joinGroup", { username, group });
}

// --- Envoi de message ---
function sendMessage() {
    const input = document.getElementById("messageInput");
    const message = input.value;
    const group = document.getElementById("group").value;

    if (message.trim() !== "") {
        socket.emit("chat message", { group, message, pin: userPin });
        input.value = "";
    }
}

// --- Réception des messages (avec déchiffrement simulé) ---
function receiveMessage(encryptedMessage, ivHex, pin) {
    try {
        // ⚠️ Simulation : dans un vrai projet, utiliser Web Crypto API avec la clé partagée
        return `[Message chiffré reçu] ${encryptedMessage}`;
    } catch {
        return "Erreur de déchiffrement";
    }
}

socket.on("chat message", (data) => {
    const decrypted = receiveMessage(data.text, data.iv, userPin);
    addMessage(`<strong>${data.user}</strong><br>${decrypted}`);
});

socket.on("system", (msg) => {
    addMessage(msg, "system");
});

// --- Upload de fichier ---
async function uploadFile() {
    const file = document.getElementById("fileInput").files[0];
    const group = document.getElementById("group").value;

    if (!file) {
        alert("Veuillez sélectionner un fichier.");
        return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("username", username);

    try {
        const response = await fetch("/upload", {
            method: "POST",
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            const firstNote = result.firstUploader === username
                ? '🏆 Premier partage !'
                : `🔁 Premier partagé par : ${result.firstUploader}`;

            socket.emit("chat message", {
                group,
                message: `📁 Fichier partagé : ${result.fileName}<br>${firstNote}`,
                pin: userPin
            });
        } else {
            alert("Erreur lors de l'envoi du fichier.");
        }
    } catch (err) {
        console.error("Erreur upload:", err);
        alert("Impossible d'envoyer le fichier.");
    }
}

// --- Ajout d'émojis ---
function addEmoji(emoji) {
    const input = document.getElementById("messageInput");
    input.value += emoji;
    input.focus();
}

// --- Déconnexion ---
function logout() {
    localStorage.removeItem("username");
    localStorage.removeItem("pin");
    window.location = "login.html";
}

// --- Connexion automatique au groupe choisi ---
joinGroup();
setPin();
