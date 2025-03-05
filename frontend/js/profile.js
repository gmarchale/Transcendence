async function loadProfile(){
	console.log("Loading profile.")

	document.getElementById("profile_container").classList.add("active");

	if(getHashParam("id") != null){
		try {
			const response = await fetch('/api/chat/test/', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
				body: JSON.stringify({ id_user_0: getHashParam("id"), id_user_1: getHashParam("id") })
			});
			const data = await response.json();
			if(data.username != null){
				document.getElementById("profile_username").textContent = data.username;
				fetch("/api/users/get_avatar/"+getHashParam("id")+"/", {
					method: "GET",headers: { 'X-CSRFToken': getCookie('csrftoken') }
				})
				.then(response => response.json())
				.then(data2 => {
					if (data2.avatar != null)
						document.getElementById("profile_avatar").style.backgroundImage = `url('${data2.avatar}')`;
					else {
						let imgElement = document.getElementById("profile_avatar");
						let placeholder = document.createElement("div");
						placeholder.className = "profile_placeholder";
						placeholder.textContent = data.username[0];
						placeholder.id = "profile_avatar";
						imgElement.parentNode.replaceChild(placeholder, imgElement);
					}
				})
				.catch(error => console.error("Error while getting avatar:", error));

				document.getElementById("profile_not_found_container").classList.remove("active");
			} else {
				document.getElementById("profile_container").classList.remove("active");
				document.getElementById("profile_not_found_container").classList.add("active");
				document.getElementById("profile_username").textContent = getTranslation("profile_user_not_found");
			}
		} catch (error) {
			console.error('Error :', error);
		}
	} else {
		document.getElementById("profile_not_found_container").classList.remove("active");
		document.getElementById("profile_username").textContent = getCookie("username");
		if(getCookie("avatar") != "null"){
			let imgElement = document.getElementById("profile_avatar");
			let placeholder = document.createElement("div");
			placeholder.className = "profile_avatar";
			placeholder.style.backgroundImage = `url('${getCookie("avatar")}')`;
			placeholder.id = "profile_avatar";
			imgElement.parentNode.replaceChild(placeholder, imgElement);
		} else {
			let imgElement = document.getElementById("profile_avatar");
			let placeholder = document.createElement("div");
			placeholder.className = "profile_placeholder";
			placeholder.textContent = getCookie("username")[0];
			placeholder.id = "profile_avatar";
			imgElement.parentNode.replaceChild(placeholder, imgElement);
		}
	}
	loadFriendship(0);
	loadBlocked(0);
}

function initProfile(){
	console.log("Initializing profile.")

	document.getElementById('profile_friend_manage').addEventListener('click', async () => {
		let cmd = "add_friend_user";
		if(document.getElementById("profile_friend_manage").textContent == getTranslation("profile_friend_manage_pending")
		|| document.getElementById("profile_friend_manage").textContent == getTranslation("profile_friend_manage_remove"))
			cmd = "delete_friend_user";

        try {
			let userId = getHashParam("id");
			if(userId == null || userId == getCookie("id")){
				showNotification(getTranslation("profile_cant_friend_yourself"), "error");
				return;
			}
			console.log("Managing friendship with "+ userId);

            const response = await fetch('/api/chat/'+ cmd +'/', {
                method: 'POST',
				headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
				body: JSON.stringify({ id_user_0: getCookie("id"), id_user_1: userId })
            });
			const data = await response.json();
			loadFriendship(1)
        } catch (error) {
            console.error('Error logging out:', error);
        }
    });

	document.getElementById('profile_block_manage').addEventListener('click', async () => {
		let cmd = "block_user";
		if(document.getElementById("profile_block_manage").textContent == getTranslation("profile_block_manage_unblock"))
			cmd = "delete_blocked_user";

        try {
			let userId = getHashParam("id");
			if(userId == null || userId == getCookie("id")){
				showNotification(getTranslation("profile_block_no_yourself"), "error");
				return;
			}
			console.log("Managing block status with "+ userId);

            const response = await fetch('/api/chat/'+ cmd +'/', {
                method: 'POST',
				headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
				body: JSON.stringify({ id_user_0: getCookie("id"), id_user_1: userId })
            });
			const data = await response.json();
			loadBlocked(1);
        } catch (error) {
            console.error('Error logging out:', error);
        }
    });
}

async function isBlocked(userId) {
	try {
		const response = await fetch('/api/chat/get_blocked/', {
			method: 'GET',
			headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') }
		});

		if (!response.ok)
			throw new Error('Erreur lors de la récupération des utilisateurs bloqués');

		const data = await response.json();
		const blockedUsers = data.blocked;

		const isBlocked = blockedUsers.some(user => user.id == userId);
		return isBlocked;
	} catch (error) {
		console.error("Erreur :", error);
	}
	return false;
}

async function loadBlocked(justClicked){
	if(await isBlocked(getHashParam("id"))){
		document.getElementById("profile_block_manage").textContent = getTranslation("profile_block_manage_unblock")
		if(justClicked == 1) showNotification(getTranslation("profile_block_success"), "error");
	} else {
		document.getElementById("profile_block_manage").textContent = getTranslation("profile_block_manage_block")
		if(justClicked == 1) showNotification(getTranslation("profile_block_unblocked_success"), "success");
	}
}

async function get_username(){
	if(getHashParam("id") != null){
		try {
			const response = await fetch('/api/chat/test/', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
				body: JSON.stringify({ id_user_0: getHashParam("id"), id_user_1: getHashParam("id") })
			});
			const data = await response.json();
			if(data.username != null)
				return data.username;
		} catch (error) {
            console.error('Error logging out:', error);
        }
	}
}

async function loadFriendship(justClicked){
	try {
		await getid();
		let userId = getHashParam("id");
		if(userId == null)
			userId = getCookie("id")
		console.log("Checking friendship with id "+ userId);

		const response = await fetch('/api/chat/check_friendship/', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
			body: JSON.stringify({ id_user_0: getCookie("id"), id_user_1: userId })
		});
		const data = await response.json();

		if(data.is_friends == "false" || await isBlocked(getHashParam("id"))){
			 if(justClicked == 1){
				if(document.getElementById("profile_friend_manage").textContent == getTranslation("profile_friend_manage_remove"))
					showNotification(getTranslation("profile_friend_removed") + await get_username(), "error");
				else if(!await isBlocked(getHashParam("id")))
					showNotification(getTranslation("profile_friend_cancelled"), "error");
			 	else
					showNotification(getTranslation("profile_friend_userisblocked"), "error");
			}
			document.getElementById("profile_friend_manage").textContent = getTranslation("profile_friend_manage_add");
		} else if(data.is_friends == "true"){
			 document.getElementById("profile_friend_manage").textContent = getTranslation("profile_friend_manage_remove")
			 if(justClicked == 1) showNotification(getTranslation("profile_friend_accepted"), "success");
		} else if(data.is_friends == "pending"){
			 document.getElementById("profile_friend_manage").textContent = getTranslation("profile_friend_manage_pending")
			 if(justClicked == 1) showNotification(getTranslation("profile_friend_requested"), "success");
		} else if(data.is_friends == "waiting"){
			 document.getElementById("profile_friend_manage").textContent = getTranslation("profile_friend_manage_accept")
		}
    } catch (error) {
        console.error('Error checking auth:', error);
    }
}
