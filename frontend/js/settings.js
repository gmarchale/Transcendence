function loadSettings(){
	console.log("Loading settings.")
	document.getElementById("settings_container").classList.add("active");
}

async function initSettings(){
	console.log("Initializing settings.")

	let selectedLanguage = localStorage.getItem("language") || "en";
    fetch("languages/lang.json")
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
    }
    await loadTranslations();

    let selectedFile = null;
    let cropper = null;

    document.getElementById("settings_avatar_upload").addEventListener("change", function(event) {
        const file = event.target.files[0];

        if (!file) return;
        if (file.type !== "image/jpeg") {
            alert("Veuillez sélectionner un fichier JPEG !"); // TODO
            event.target.value = "";
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            selectedFile = file;
            document.getElementById("settings_cropImage").src = e.target.result;
            document.getElementById("settings_popupContainer").style.display = "block";

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
        alert("Image confirmée !"); // TODO
        document.getElementById("settings_popupContainer").style.display = "none";
    });

    document.getElementById("settings_cancelUpload").addEventListener("click", function() {
        alert("Image annulée !"); // TODO
        document.getElementById("settings_avatar_upload").value = "";
        document.getElementById("settings_popupContainer").style.display = "none";
        selectedFile = null;
    });
}

let translationsCache = null;
async function loadTranslations() {
	console.log("reloading lang2")
    try {
        const response = await fetch("languages/lang2.json");
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