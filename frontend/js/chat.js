function loadChat(){
    console.log("Loading chat. -- NOW");
    fetch("/api/chat/get_friends/", {
        method: "GET",
        credentials: "include"
    })
    .then(response => response.json())
    .then(data => {
        console.log("Response data:", data);
        if (data.mutual_friends && data.mutual_friends.length > 0) {
            let friendsUl = document.getElementById("chat_friends_ul");
            friendsUl.innerHTML = "";

            data.mutual_friends.forEach(friend => {
                let li = document.createElement("li");
                li.textContent = friend.username;
                li.classList.add("friend-item");
                li.dataset.friendId = friend.id;
                friendsUl.appendChild(li);

                li.addEventListener("click", function () {
                    openChat(friend.username, friend.id);
                });
            });
        } else {
            console.warn("Aucun ami trouvé.");
        }
    })
    .catch(error => console.error("Error while getting friend list :", error));

    let inputField = document.getElementById("chat_input");
    let sendButton = document.getElementById("chat_send_message");

    sendButton.addEventListener("click", sendMessage);
    inputField.addEventListener("keypress", function (event) {
        if (event.key === "Enter") {
            sendMessage();
        }
    });
}


let chatSocket = null;
let reconnectTimeout = null;
let shouldReconnect = true;
let currentUserId = null;

function initWebSocket(ws_url) {
    chatSocket = new WebSocket(ws_url);
    shouldReconnect = true;
    chatSocket.onopen = function () {
        console.log("WebSocket connecté");
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
        }
    };

    chatSocket.onmessage = function (event) {
        const data = JSON.parse(event.data);
        if (data.message && data.sender_id) {
            appendMessage(data.sender_id, data.message, true);
        } else {
            console.warn("Message invalide reçu :", data);
        }
    };

    chatSocket.onerror = function (error) {
        console.error("WebSocket erreur :", error);
    };

    chatSocket.onclose = function () {
        console.warn("WebSocket déconnecté.");
        if (false) {
            console.warn("Tentative de reconnexion...");
            reconnectTimeout = setTimeout(() => initWebSocket(ws_url), 3000);
        }
    };
}


async function sendMessage() {
    if (!chatSocket || chatSocket.readyState !== WebSocket.OPEN) {
        console.error("WebSocket non connecte, message non envoye.");
        return;
    }

    const senderId = getCookie("id");
    const friendId = currentFriendId;
    let inputField = document.getElementById("chat_input");
    let message = inputField.value.trim();
    if (message === "") return;

    //appendMessage("You", message, true);
    inputField.value = "";

    chatSocket.send(JSON.stringify({
        "sender_id": senderId,
        "receiver_id": friendId,
        "message": message
    }));

    //await fetch('/api/chat/send_message/', {
    //    method: 'POST',
    //    headers: {'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken')},
    //    body: JSON.stringify({ id_user_0: senderId, id_user_1: friendId, message: message })
    //});
}

function appendMessage(sender, message, isUser) {


    if (sender == currentUserId)
        isUser = true;
    else
        isUser = false;

	let messagesContainer = document.getElementById("chat_messages");
	let messageDiv = document.createElement("div");
	messageDiv.classList.add("chat_message");
	messageDiv.classList.add(isUser ? "chat_user_message" : "chat_friend_message");
	let avatarUrl = "/images/logo.jpg";
	if(!isUser)
		messageDiv.innerHTML = `
			<img src="${avatarUrl}" alt="Avatar de ${sender}" class="chat_avatar">
			<span class="chat_text">${message}</span>`;
	else
		messageDiv.innerHTML = `
			<span class="chat_text">${message}</span>
			<img src="${avatarUrl}" alt="Avatar de ${sender}" class="chat_avatar">`;
	messagesContainer.appendChild(messageDiv);
	messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function fetchMessages(friendId) {
	if (!friendId) return;

	const response = await fetch(`/api/chat/get_message/?id_user_1=${friendId}`);
	const data = await response.json();

	document.getElementById("chat_messages").innerHTML = "";
	data.messages.forEach(msg => {
		appendMessage(msg.sender, msg.text, false);
	});
}

let currentFriendId = null;
let currentRoomName = null;



async function openChat(username, friendId) {
    if (!currentUserId) {
        console.error("Impossible d'obtenir l'ID utilisateur");
        return;
    }
    const roomName = "chat_" + Math.min(currentUserId, friendId) + "_" + Math.max(currentUserId, friendId);
    const WS_URL = `wss://${window.location.host}/ws/chat/${roomName}/`;

    console.log("userId =", currentUserId);
    console.log("friendId =", friendId);
    console.log("Room name:", roomName);

    currentFriendId = friendId;
    currentRoomName = roomName;

    initWebSocket(WS_URL);

    fetchMessages(friendId);

    let friendsList = document.getElementById("chat_friends_list");
    let chatBox = document.getElementById("chat_container");
    friendsList.style.display = "none";
    chatBox.style.display = "block";

    document.getElementById("chat_username").textContent = username;
    document.getElementById("chat_messages").innerHTML = "<p>Loading messages with " + username + "...</p>";
}


async function initChat(){
	console.log("Initializing chat.")
	//return;
	//initWebSocket()

    currentUserId = await getid();
    if (!currentUserId) {
        console.error("Impossible d'obtenir l'ID utilisateur");
        return;
    }


	let chatContainer = document.getElementById("chat_main_container");
	let chatToggle = document.getElementById("chat_toggle");

	let friendsList = document.getElementById("chat_friends_list");
	let chatBox = document.getElementById("chat_container");
	let backToFriends = document.getElementById("back_to_friends");

	chatToggle.addEventListener("click", function () {
		chatContainer.classList.toggle("expanded");
	});

	backToFriends.addEventListener("click", function () {
        if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
            chatSocket.close();
        }
		chatBox.style.display = "none";
		friendsList.style.display = "block";
	});

    window.addEventListener("beforeunload", function() {
        if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
            chatSocket.close();
            shouldReconnect = false;
        }
    });

}


