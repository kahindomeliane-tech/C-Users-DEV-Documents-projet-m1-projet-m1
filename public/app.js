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

// --- Génération de clé AES à partir du PIN ---
async function getKeyFromPin(pin) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        enc.encode(pin),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );

    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: enc.encode("chat-salt"),
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-CBC", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

// --- Chiffrement ---
async function encryptMessage(message, pin) {
    const key = await getKeyFromPin(pin);
    const iv = crypto.getRandomValues(new Uint8Array(16));
    const enc = new TextEncoder();
    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-CBC", iv },
        key,
        enc.encode(message)
    );
    return {
        encrypted: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
        iv: btoa(String.fromCharCode(...iv))
    };
}

// --- Déchiffrement ---
async function decryptMessage(encryptedBase64, ivBase64, pin) {
    try {
        const key = await getKeyFromPin(pin);
        const encryptedBytes = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
        const iv = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));
        const decrypted = await crypto.subtle.decrypt(
            { name: "AES-CBC", iv },
            key,
            encryptedBytes
        );
        return new TextDecoder().decode(decrypted);
    } catch {
        return "Erreur de déchiffrement";
    }
}

// --- Envoi de message ---
async function sendMessage() {
    const input = document.getElementById("messageInput");
    const message = input.value;
    const group = document.getElementById("group").value;

    if (message.trim() !== "") {
        const { encrypted, iv } = await encryptMessage(message, userPin);
        socket.emit("chat message", { group, encrypted, iv });
        input.value = "";
    }
}

// --- Réception des messages ---
socket.on("chat message", async (data) => {
    const decrypted = await decryptMessage(data.encrypted, data.iv, userPin);
    if (decrypted === "Erreur de déchiffrement") {
        // Afficher l'information et proposer le texte chiffré
        addMessage(`<strong>${data.user}</strong><br><em>Message chiffré (impossible de déchiffrer avec votre PIN)</em><br><small>${data.encrypted}</small>`, "message");
    } else {
        addMessage(`<strong>${data.user}</strong><br>${decrypted}`);
    }
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

            const { encrypted, iv } = await encryptMessage(
                `📁 Fichier partagé : ${result.fileName}<br>${firstNote}`,
                userPin
            );

            socket.emit("chat message", { group, encrypted, iv });
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
// Demander le PIN d'abord pour s'assurer que le chiffrement/déchiffrement fonctionne
setPin();
joinGroup();
