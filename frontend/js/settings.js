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
    }

	await loadTranslations();
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