async function loadHeader() {
    console.log("Loading header.");

    const blur = document.getElementById("blur-overlay")
    blur.classList.remove("active");

    await checkAuth();

    document.getElementById('header_username').textContent = getCookie("username") + "▾";
    
    if(getCookie("avatar") != "null"){
        let imgElement = document.getElementById("header_userAvatar");
        let placeholder = document.createElement("div");
        placeholder.className = "user-avatar_head";
        placeholder.style.backgroundImage =`url('${getCookie("avatar")}')`;
        placeholder.id = "header_userAvatar";
        imgElement.parentNode.replaceChild(placeholder, imgElement);
    } else {
        let imgElement = document.getElementById("header_userAvatar");
        let placeholder = document.createElement("div");
        placeholder.className = "user-avatar_placeholder";
        placeholder.textContent = getCookie("username")[0];
        placeholder.id = "header_userAvatar";
        imgElement.parentNode.replaceChild(placeholder, imgElement);
    }    
}

function closeMenu_header(menu){
    menu.style.display = 'none';
    document.getElementById('header_username').textContent = getCookie("username") + "▾";
}

function openMenu_header(menu){
    menu.style.display = 'block';
    document.getElementById('header_username').textContent = getCookie("username") + "▴";
}

function initHeader(){
    console.log("Initializing header.")

    document.getElementById('header_userButton').addEventListener('click', function() {
        const menu = document.getElementById('header_dropdownMenu');
        if(menu.style.display == 'block' && !menu.matches(':hover'))
            closeMenu_header(menu);
        else openMenu_header(menu);
    });

    document.addEventListener('click', function(event) {
        const menu = document.getElementById('header_dropdownMenu');
        const button = document.getElementById('header_userButton');
        const elements = document.querySelectorAll("#header_dropdownMenuButton");

        elements.forEach(element => {
            if(element.matches(':hover'))
                closeMenu_header(menu);
        });
        if(document.getElementById("header_logout").matches(':hover'))
            closeMenu_header(menu);

        if ((!button.matches(':hover') && !menu.matches(':hover')))
            closeMenu_header(menu);
    });

    document.addEventListener('scroll', function() {
        const menu = document.getElementById('header_dropdownMenu');
        closeMenu_header(menu);
    });

    document.getElementById('header_logout').addEventListener('click', async () => {
        logout(1);
    });

    document.addEventListener("mouseover", function(event) {
        if (event.target.tagName === "A") {
            var link = event.target.href;
            var prefetch = document.createElement("link");
            prefetch.rel = "prefetch";
            prefetch.href = link;
            document.head.appendChild(prefetch);
        }
    });
}


let notificationTimeout;
function showNotification(message, type = "success", duration = 3000) {
    let notification = document.getElementById("notification");
    let notificationText = document.getElementById("notification_text");

    if (notificationTimeout)
        clearTimeout(notificationTimeout);
    notificationText.textContent = message;
    notification.className = `notification ${type} show`;

    notificationTimeout = setTimeout(() => {
        notification.classList.add("hide");
        notificationTimeout = setTimeout(() => {
            notification.className = "notification";
        }, 300);
    }, duration);
}
