function loadSettings(){
	console.log("Loading settings.")
	document.getElementById("settings_container").classList.add("active");
    document.getElementById("settings_popupContainer").classList.remove("active");

    fetch("/api/chat/get_blocked/", { method: "GET", credentials: "include",
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') }})
	.then(response => response.json())
	.then(data => {
		if (data.blocked) {
			let blockedList = document.getElementById("settings_blocked_list");
			blockedList.innerHTML = "";

            function setNoBlocked(){
                let noBlockedUl = document.createElement("ul");
				noBlockedUl.classList.add("settings_noblocked_ul");
				noBlockedUl.classList.add("active");
				noBlockedUl.id = "settings_noblocked_ul";

				let noBlockedP = document.createElement("p");
				noBlockedP.id = "settings_noblocked";
				noBlockedP.textContent = getTranslation("settings_noblocked");
				
				noBlockedUl.appendChild(noBlockedP);
				blockedList.appendChild(noBlockedUl);
            }

			if(data.blocked.length == 0)
                setNoBlocked();

			data.blocked.forEach(blocked => {
                let li = document.createElement("ul");
				li.id = "settings_blocked_ul"
				li.textContent = blocked.username;
				li.classList.add("active");
				li.classList.add("settings_blocked_ul")
				li.dataset.blockedId = blocked.id;

				blockedList.appendChild(li);

                document.getElementById("settings_blocked_ul").addEventListener("mouseover", function () {              
                    setTimeout(() => {
                        this.textContent = getTranslation("settings_unblock_button") + blocked.username;
                    }, 100);
                });
                
                document.getElementById("settings_blocked_ul").addEventListener("mouseout", function () {                
                    setTimeout(() => {
                        this.textContent = blocked.username;
                    }, 100);
                });

                document.getElementById("settings_blocked_ul").addEventListener("click", async function () {
                    try {
                        let userId = this.dataset.blockedId;
                        console.log("Managing block status with "+ userId);
            
                        await fetch('/api/chat/delete_blocked_user/', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
                            body: JSON.stringify({ id_user_0: getCookie("id"), id_user_1: userId })
                        });
                        blockedList.removeChild(this);
                        if(blockedList.children.length == 0)
                            setNoBlocked();
                    } catch (error) {
                        console.error('Error:', error);
                    } 
                });
                
				// li.addEventListener("click", function () {
				// 	openChat(friend.username, friend.id);
				// });
                // TODO
			});
		} else console.warn("Error while getting blocked from API");
	})
	.catch(error => console.error("Error while getting blocked list :", error));
}

async function initSettings(){
	console.log("Initializing settings.")

	let selectedLanguage = localStorage.getItem("language") || "en";
    fetch("languages/lang.json", { cache: "no-cache" })
        .then(response => response.json())
        .then(translations => {
            updateLanguage(selectedLanguage, translations);

            document.getElementById("settings_lang_fr").addEventListener("click", function () {
                updateLanguage("fr", translations);
            });

            document.getElementById("settings_lang_en").addEventListener("click", function () {
                updateLanguage("en", translations);
            });
        });

    function updateLanguage(lang, translations) {
        localStorage.setItem("language", lang);

		Object.keys(translations[lang]).forEach(id => {
            let element = document.getElementById(id);
            if (element) {
                if (element.tagName === "INPUT") {
                    element.placeholder = translations[lang][id];
                } else {
                    element.innerText = translations[lang][id];
                }
            }
        });
        document.getElementById("settings_lang_fr").classList.toggle("active", lang === "fr");
        document.getElementById("settings_lang_en").classList.toggle("active", lang === "en");
        updateChatLanguage();
        loadSettings();
        loadChat();
    }
    await loadTranslations();

    let selectedFile = null;
    let cropper = null;

    document.getElementById("settings_avatar_upload").addEventListener("change", function(event) {
        const file = event.target.files[0];

        if (!file) return;
        if (file.type !== "image/jpeg" && file.type !== "image/png") {
            alert(getTranslation("settings_select_png")); // TODO
            event.target.value = "";
            return;
        }
        const blur = document.getElementById("blur-overlay")
        blur.classList.add("active");

        const reader = new FileReader();
        reader.onload = function(e) {
            selectedFile = file;
            document.getElementById("settings_cropImage").src = e.target.result;
            document.getElementById("settings_popupContainer").classList.add("active");

            if (cropper)
                cropper.destroy();
            cropper = new Cropper(document.getElementById("settings_cropImage"), {
                aspectRatio: 1,
                viewMode: 2
            });
        };
        reader.readAsDataURL(file);
    });
 
    document.getElementById("settings_confirmUpload").addEventListener("click", function() {
        if (!cropper) return;

        cropper.getCroppedCanvas().toBlob((blob) => {
            const croppedFile = new File([blob], selectedFile.name, { type: "image/jpeg" });

            const formData = new FormData();
            formData.append("image", croppedFile);

            // fetch("/api/upload/", {
            //     method: "POST",
            //     body: formData
            // })
            // .then(response => response.json())
            // .then(data => {
            //     alert("Image envoyée avec succès !");
            //     document.getElementById("popupContainer").style.display = "none";
            // })
            // .catch(error => console.error("Erreur upload :", error));
            // TODO
        }, "image/jpeg");
        alert("Image confirmée ! (Back-end ToDo)"); // TODO
        document.getElementById("settings_popupContainer").classList.remove("active");

        const blur = document.getElementById("blur-overlay")
        blur.classList.remove("active");
    });

    document.getElementById("settings_cancelUpload").addEventListener("click", function() {
        document.getElementById("settings_avatar_upload").value = "";
        document.getElementById("settings_popupContainer").classList.remove("active");

        const blur = document.getElementById("blur-overlay")
        blur.classList.remove("active");
        selectedFile = null;
    });
}

let translationsCache = null;
async function loadTranslations() {
	console.log("reloading lang2")
    try {
        const response = await fetch("languages/lang2.json", { cache: "no-cache" });
        translationsCache = await response.json();
    } catch (error) {
        console.error("Error reading translations json :", error);
        translationsCache = {};
    }
}

function getTranslation(key) {
    let selectedLanguage = localStorage.getItem("language") || "fr";
    
    if (!translationsCache)
        return "NULL"; 

    return translationsCache[selectedLanguage]?.[key] ?? "NULL";
}