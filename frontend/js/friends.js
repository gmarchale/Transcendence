async function loadFriends(){
	console.log("Loading friends.")

	document.getElementById("friends_container").classList.add("active");
	try {
		const response = await fetch('/api/chat/get_friends/', {
			method: 'GET',
			headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') }
		});
		const data = await response.json();
		
		const friendsList = document.getElementById("friends_list");
		friendsList.innerHTML = '';
		
		if(data.friends && data.friends.length > 0){
			data.friends.forEach(friend => {
				const friendElement = document.createElement('div');
				friendElement.className = 'friends-item';
				friendElement.innerHTML = `
					<div class="friends-item-info">
						<img src="/images/logo.jpg" alt="Friend Avatar" class="friends_avatar">
						<span class="friends_username">${friend.username}</span>
					</div>
					<div class="friends-item-actions">
						<button class="friends_message-btn" onclick="openChat('${friend.id}')">Message</button>
						<button class="friends_remove-btn" onclick="manageFriendship('${friend.id}', 'delete_friend_user')">Remove</button>
					</div>
				`;
				friendsList.appendChild(friendElement);
			});
		} else {
			friendsList.innerHTML = '<p class="friends_no-items">No friends found</p>';
		}
		
		// Load pending requests
		loadPendingRequests();
	} catch (error) {
		console.error('Error loading friends:', error);
		document.getElementById("friends_container").classList.remove("active");
		document.getElementById("friends_not_found_container").classList.add("active");
		document.getElementById("friends_not_found").textContent = "Error loading friends";
	}
}


function initFriends(){
	console.log("Initializing friends page.")
	
	// document.getElementById('friends_search_button').addEventListener('click', addFriend);
	// document.getElementById('friends_search').addEventListener('keypress', function(e) {
	// 	if(e.key === 'Enter') {
	// 		addFriend();
	// 	}
	// });
	
	fetchFriends();
}

fetchFriends();
fetchBlockedUsers(); //TO DO

async function addFriend() {
	const friendInput = document.getElementById('friendInput').value;
	if (!friendInput) return alert('enter a name');
	await fetch('/api/chat/add_friend_username/', {
		method: 'POST',
		headers: {'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken')},
		body: JSON.stringify({id_user_1: friendInput})
	});
}


async function fetchFriends() {
    console.log("Loading friend list.");
    fetch("/api/chat/get_friends/", {
        method: "GET",
        credentials: "include"
    })
    .then(response => response.json())
    .then(data => {
        console.log("Response data:", data);
        if (data.mutual_friends && data.mutual_friends.length > 0) {
            let friendsUl = document.getElementById("friendsList");
            friendsUl.innerHTML = "";

            data.mutual_friends.forEach(friend => {
                let li = document.createElement("li");
                li.textContent = friend.username;
                li.classList.add("friend-item");
                li.dataset.friendId = friend.id;
                friendsUl.appendChild(li);

                li.addEventListener("click", function () {
                    window.location.href = `#profile?id=${friend.id}`;
                });
            });
        } else {
            console.warn("Aucun ami trouvé.");
        }
    })
    .catch(error => console.error("Error while getting friend list :", error));
}

async function fetchBlockedUsers() {
    console.log("Loading blocked users list.");
    fetch("/api/chat/get_blocked/", {
        method: "GET",
        credentials: "include"
    })
    .then(response => response.json())
    .then(data => {
        console.log("Response data:", data);
        if (data.blocked && data.blocked.length > 0) {
            let blockedUsersUl = document.getElementById("blockedList");
            blockedUsersUl.innerHTML = "";

            data.blocked.forEach(blockedUser => {
                let li = document.createElement("li");
                li.textContent = blockedUser.username;
                li.classList.add("blocked-user-item");
                li.dataset.blockedUserId = blockedUser.id;
                blockedUsersUl.appendChild(li);

                li.addEventListener("click", function () {
                    window.location.href = `#profile?id=${blockedUser.id}`;
                });
            });
        } else {
            console.warn("No blocked users found.");
        }
    })
    .catch(error => console.error("Error while getting blocked users list:", error));
}


async function searchUsers(){
	const searchInput = document.getElementById('friends_search').value.trim();
	const searchResults = document.getElementById('friends_search_results');
	
	if(searchInput.length < 3){
		searchResults.innerHTML = '<p class="friends_search-error">Please enter at least 3 characters</p>';
		return;
	}
	
	try {
		const response = await fetch('/api/chat/add_friend_username/', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
			body: JSON.stringify({ id_user_1: searchInput })
		});
		const data = await response.json();
		
		searchResults.innerHTML = '';
		
		if(data.users && data.users.length > 0) {
			data.users.forEach(user => {
				// Don't display current user in search results
				if(user.id === getCookie('id')) return;
				
				const userElement = document.createElement('div');
				userElement.className = 'friends_search-item';
				userElement.innerHTML = `
					<div class="friends-item-info">
						<img src="/images/logo.jpg" alt="User Avatar" class="friends_avatar">
						<span class="friends_username">${user.username}</span>
					</div>
					<div class="friends-item-actions">
						<button class="friends_add-btn" onclick="manageFriendship('${user.id}', 'add_friend_user')">Add Friend</button>
						<button class="friends_profile-btn" onclick="viewProfile('${user.id}')">View Profile</button>
					</div>
				`;
				searchResults.appendChild(userElement);
			});
		} else {
			searchResults.innerHTML = '<p class="friends_no-items">No users found</p>';
		}
	} catch (error) {
		console.error('Error searching users:', error);
		searchResults.innerHTML = '<p class="friends_search-error">Error searching users</p>';
	}
}

async function manageFriendship(userId, action){
	try {
		const response = await fetch(`/api/chat/${action}/`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
			body: JSON.stringify({ id_user_0: getCookie('id'), id_user_1: userId })
		});
		const data = await response.json();
		console.log(`Friend action (${action}) response:`, data);
		
		// Reload friends list after action
		loadFriends();
		
		// If search was performed, refresh search results
		if(document.getElementById('friends_search').value.trim().length >= 3) {
			searchUsers();
		}
	} catch (error) {
		console.error(`Error in friend action (${action}):`, error);
	}
}

function viewProfile(userId) {
	window.location.href = `#profile?id=${userId}`;
}

function openChat(userId) {
	window.location.href = `#chat?id=${userId}`;
}