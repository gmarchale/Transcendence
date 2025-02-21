async function loadFriends() {
    console.log("Loading friends.");
    document.getElementById("friends_container").classList.add("active");
       
    let container = document.getElementById("friends_list");
    if (!container) {
        console.error("Friends list container not found!");
        return;
    }
    container.innerHTML = "";
    let inputBox = document.createElement("input");
    inputBox.type = "text";
    inputBox.placeholder = "Enter a name...";
    inputBox.id = "friends_input";
       
    let helloMessage = document.createElement("p");
    helloMessage.textContent = "Hello";
    helloMessage.id = "hello_message";
       
    container.appendChild(inputBox);
    container.appendChild(helloMessage);
    initFriends();
}

async function initFriends() {
    console.log("Initializing friends page.");
        
    await loadFriends();
}