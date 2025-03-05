function loadChat(){
	console.log("Loading chat.")
	chat_currentlyWith = 0;
	chat_usernameWith = null;
	let chatContainer = document.getElementById("chat_main_container");
	let isClosed = !chatContainer.classList.contains("expanded");
	if (!isClosed){
		chatContainer.classList.toggle("expanded");
		document.getElementById("chat_title").textContent = "Chat";
	}
	closeChat()

	fetch("/api/chat/get_friends/", { method: "GET", credentials: "include" })
	.then(response => response.json())
	.then(data => {
		if (data.mutual_friends) {
			let friendsList = document.getElementById("chat_friends_list");
			friendsList.innerHTML = "";
			if(data.mutual_friends.length == 0){
				let noFriendsUl = document.createElement("ul");
				noFriendsUl.classList.add("chat_nofriends_ul");
				noFriendsUl.classList.add("active");
				noFriendsUl.id = "chat_nofriends_ul";

				let noFriendsP = document.createElement("p");
				noFriendsP.id = "chat_nofriends";
				noFriendsP.textContent = getTranslation("chat_nofriends");
				
				noFriendsUl.appendChild(noFriendsP);
				friendsList.appendChild(noFriendsUl);
			}

				
			data.mutual_friends.forEach(friend => {
				let li = document.createElement("ul");
				li.id = "chat_friends_ul"
				li.textContent = friend.username;
				li.classList.add("active");
				li.classList.add("chat_friends_ul")
				li.dataset.friendId = friend.id;

				friendsList.appendChild(li);

				li.addEventListener("click", function () {
					openChat(friend.username, friend.id);
				});
			});
		} else {
			console.warn("Error while getting friends from API");
		}
	})
	.catch(error => console.error("Error while getting friend list :", error));
	
    let inputField = document.getElementById("chat_input");
    let sendButton = document.getElementById("chat_send_message");

    sendButton.addEventListener("click", chat_sendMessage);

    inputField.addEventListener("keypress", function (event) {
		const hash = location.hash.split('?')[0].slice(1) || 'game';
		if ((event.code === "Enter" || event.code === "NumpadEnter") && chat_currentlyWith != 0 && hash != "login" && hash != "register") {
            chat_sendMessage();
        }
    });
}

let chat_usernameWith = null;
let chat_avatarWith = null;
let chat_currentlyWith = 0;
let chat_Socket = null;
let chat_reconnectTimeout = null;
let chat_shouldReconnect = true;

function initWebSocket(ws_url) {
    chat_Socket = new WebSocket(ws_url);
    chat_shouldReconnect = true;
    chat_Socket.onopen = function () {
        console.log("WebSocket connected");
        if (chat_reconnectTimeout) {
            clearTimeout(chat_reconnectTimeout);
        }
    };

    chat_Socket.onmessage = function (event) {
        const data = JSON.parse(event.data);
        if (data.message && data.sender_id) {
            chat_appendMessage(data.sender_id, data.message, data.sender_id == getCookie("id") ? true: false);
        } else {
            console.warn("Invalid message received :", data);
        }
    };

    chat_Socket.onerror = function (error) {
        console.error("WebSocket error :", error);
    };

    chat_Socket.onclose = function () {
        console.warn("WebSocket disconnected.");
        if (chat_shouldReconnect == true) {
            console.warn("Trying to reconnect websocket...");
            chat_reconnectTimeout = setTimeout(() => initWebSocket(ws_url), 3000);
        }
    };
}

async function chat_sendMessage() {
	if (!chat_Socket || chat_Socket.readyState !== WebSocket.OPEN) {
        console.error("WebSocket non connecte, message non envoye.");
        return;
    }

	const userId = chat_currentlyWith;

	let inputField = document.getElementById("chat_input");
	let message = inputField.value.trim();
	if (message === "") return;

	inputField.value = "";

	chat_Socket.send(JSON.stringify({
        "sender_id": getCookie("id"),
        "receiver_id": userId,
        "message": message
    }));
}

function chat_appendMessage(sender, message, isUser) {
	let messagesContainer = document.getElementById("chat_messages");
	let messageDiv = document.createElement("div");
	messageDiv.classList.add("chat_message");
	messageDiv.classList.add(isUser ? "chat_user_message" : "chat_friend_message");

	let avatarUrl;
	if(isUser){
		avatarUrl = getCookie("avatar");
		updateavatar();
	} else {
		avatarUrl = chat_avatarWith;
		updateavatar();
	}

	function updateavatar(){
		let username = isUser ? getCookie("username"): chat_usernameWith;
		if(avatarUrl == "null"){
			messageDiv.innerHTML = `
				<div class="chat_only_message"><span class="chat_text">${message}</span></div>
				<div alt="Avatar de ${username}" class="chat_avatar_placeholder">${username[0]}</div>`;
		} else {
			messageDiv.innerHTML = `
				<div class="chat_only_message"><span class="chat_text">${message}</span></div>
				<div style="background-image: url('${avatarUrl}');" alt="Avatar de ${username}" class="chat_avatar">`;
		}
		messagesContainer.appendChild(messageDiv);
		messagesContainer.scrollTop = messagesContainer.scrollHeight;
	}
}

async function fetchMessages(friendId) {
	if (!friendId) return;

	const response = await fetch(`/api/chat/get_message/?id_user_1=${friendId}`);
	const data = await response.json();
	
	document.getElementById("chat_messages").innerHTML = "";
	data.messages.forEach(msg => {
		let isUser = msg.sender == getCookie("id") ? true : false;
		chat_appendMessage(msg.sender, msg.text, isUser);
	});
}

function updateChatLanguage(){
	if(chat_currentlyWith != 0){
		document.getElementById("chat_title").textContent = "Chat - " + chat_usernameWith;
		document.getElementById("chat_send_message").textContent = getTranslation("chat_send_message");
		document.getElementById("back_to_friends").textContent = getTranslation("chat_back_to_friends");
		document.getElementById("chat_input").placeholder = getTranslation("chat_input");
	} else {
		let chatContainer = document.getElementById("chat_main_container");
		let isClosed = !chatContainer.classList.contains("expanded");
		if (!isClosed) document.getElementById("chat_title").textContent = "Chat - " + getTranslation("chat_friendlist_title");
		else document.getElementById("chat_title").textContent = "Chat";
	}
}

function openChat(username, friendId) {
	const roomName = "chat_" + Math.min(getCookie("id"), friendId) + "_" + Math.max(getCookie("id"), friendId);
	const wsScheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const WS_URL = `${wsScheme}://${window.location.host}/ws/chat/${roomName}/`;

	console.log("userId =", getCookie("id"));
    console.log("friendId =", friendId);
    console.log("Room name:", roomName);

	initWebSocket(WS_URL);

	fetchMessages(friendId)

	let friendsList = document.getElementById("chat_friends_list");
	let chatBox = document.getElementById("chat_container");
	let settings = document.getElementById("chat_settings");

	friendsList.style.display = "none"; 
	chatBox.style.display = "block";
	settings.style.display = "block";
	chat_currentlyWith = friendId;
	chat_usernameWith = username;

	fetch("/api/users/get_avatar/"+chat_currentlyWith+"/", {
		method: "GET",headers: { 'X-CSRFToken': getCookie('csrftoken') }
	})
	.then(response => {
		chat_avatarWith = "null";
		continuosity();
		return response.json();
	})
	.then(data2 => {
		if (data2.avatar != null) chat_avatarWith = data2.avatar;
		else chat_avatarWith = "null";
		continuosity();
	})
	.catch(error => console.error("Error while getting avatar:", error));

	function continuosity(){
		updateChatLanguage()
		document.getElementById("chat_messages").innerHTML = "<p>Loading messages with " + username + "...</p>";
	}
}

function initChat(){
	console.log("Initializing chat.")

	const chatContainer = document.getElementById("chat_main_container");
	const chatToggle = document.getElementById("chat_header");
	const backToFriends = document.getElementById("back_to_friends");
	const settings = document.getElementById("chat_settings");
	const menu = document.getElementById('chat_dropdownMenu');

	chatToggle.addEventListener("click", function(event) {
		let clickedElement = event.target;
		if (!clickedElement.closest("#chat_settings") && !clickedElement.closest("#chat_dropdownMenu")) {
			let isClosed = !chatContainer.classList.contains("expanded");
			if (isClosed){
				loadChat()
				document.getElementById("chat_title").textContent = "Chat - " + getTranslation("chat_friendlist_title");
			} else {
				if (chat_Socket && chat_Socket.readyState === WebSocket.OPEN) {
					chat_shouldReconnect = false;
					chat_Socket.close();
				}

				document.getElementById("chat_title").textContent = "Chat";
				settings.style.display = "none";
				chat_currentlyWith = 0;
			}
			chatContainer.classList.toggle("expanded");
		}
	});
	

	backToFriends.addEventListener("click", function () {
		closeChat()
	});

	document.getElementById('chat_settings').addEventListener('click', function() {
        if(menu.style.display == 'block' && !menu.matches(':hover'))
            chat_closeMenu(menu);
        else chat_openMenu(menu);
    });

	document.getElementById('chat_dropdownMenuButton_Profile').addEventListener('click', function() {
        if(chat_currentlyWith != null){
			window.location.href = "#profile?id=" + chat_currentlyWith;
			chat_closeMenu(menu);
		}
    });

	document.addEventListener('click', function(event) {
        const menu = document.getElementById('chat_dropdownMenu');
        const elements = document.querySelectorAll("#chat_dropdownMenuButton");

        elements.forEach(element => {
            if(element.matches(':hover'))
                chat_closeMenu(menu);
        });
        if(document.getElementById("chat_block").matches(':hover'))
            chat_closeMenu(menu);

        if ((!settings.matches(':hover') && !menu.matches(':hover')))
            chat_closeMenu(menu);
    });

	document.getElementById('chat_block').addEventListener('click', async () => {
		let cmd = "block_user";

        try {
			console.log("Managing block status with "+ chat_currentlyWith);

            const response = await fetch('/api/chat/'+ cmd +'/', {
                method: 'POST',
				headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
				body: JSON.stringify({ id_user_0: getCookie("id"), id_user_1: chat_currentlyWith })
            });
			document.getElementById("chat_block").textContent = getTranslation("profile_block_manage_block")
			showNotification(getTranslation("profile_block_success"), "error");
			loadChat();
        } catch (error) {
            console.error('Error logging out:', error);
        }
    });

	window.addEventListener("beforeunload", function() {
        if (chat_Socket && chat_Socket.readyState === WebSocket.OPEN) {
            chat_Socket.close();
            chat_shouldReconnect = false;
        }
    });
}

function closeChat(){
	if (chat_Socket && chat_Socket.readyState === WebSocket.OPEN) {
		chat_shouldReconnect = false;
		chat_Socket.close();
	}

	let friendsList = document.getElementById("chat_friends_list");
	let chatBox = document.getElementById("chat_container");
	let settings = document.getElementById("chat_settings");

	chatBox.style.display = "none";
	settings.style.display = "none";
	friendsList.style.display = "block";
	chat_currentlyWith = 0;
	chat_usernameWith = null;
	chat_avatarWith = null;
	let chatContainer = document.getElementById("chat_main_container");
	let isClosed = !chatContainer.classList.contains("expanded");
	if (!isClosed)
		document.getElementById("chat_title").textContent = "Chat - " + getTranslation("chat_friendlist_title");
}

function chat_closeMenu(menu){
    menu.style.display = 'none';
}

function chat_openMenu(menu){
	console.log("[Chat] openMenu called.")
    menu.style.display = 'block';
}