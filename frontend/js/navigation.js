let isPreloaded = 0
async function loadContentFromHash() {
	const hash = location.hash.split('?')[0].slice(1) || 'game';
	document.querySelectorAll(".page").forEach(div => {
		div.classList.remove("active");
	});
	let loadPage = 1;
	if(hash != "login" && hash != "register"){
		let result = await loadHeader();
        if (result === false)
            loadPage = 0;
		document.getElementById("header").classList.add("active");
	} else document.getElementById("header").classList.remove("active");
	document.title = hash.charAt(0).toUpperCase() + hash.slice(1) + " - PONG"
	if(isPreloaded == 0 || loadPage == 0)
		return;

	let pageDiv = document.getElementById(hash);
	if (pageDiv) {
		pageDiv.classList.add("active");
		switch (hash){
			case "profile": loadProfile();break;
			case "settings": loadSettings();break;
			case "game": loadGame();break;
			case "login": loadLogin();break;
			case "register": loadRegister();break;

			case "chat": loadChat();break;
		}
	}
}

function preloadPages() {
    const pages = ["game", "profile", "settings", "login", "register", "chat"];
    const promises = pages.map(page =>
        fetch(page + ".html")
            .then(response => response.text())
            .then(html => {
                document.getElementById(page).innerHTML = html;
            })
            .catch(error => console.error("Erreur de chargement :", error))
    );
	Promise.all(promises).then(() => {
        console.log("✅ Toutes les pages ont été chargées !");
		isPreloaded = 1;
		initHeader();
		initLogin();
		initProfile();
		initGame();
		initSettings();
		initRegister();
		initChat();
		new PongGame();

		loadContentFromHash();
    });
}

function navigateTo(path) {
    location.hash = path;
}

window.addEventListener("hashchange", loadContentFromHash);

document.addEventListener("DOMContentLoaded", () => {
    preloadPages();
    loadContentFromHash();
});

function updateHashParam(param, value) {
    let baseHash = location.hash.split('?')[0];
    let params = new URLSearchParams(location.hash.split('?')[1] || "");

    params.set(param, value);
    location.hash = baseHash + "?" + params.toString();
}

function getHashParam(param) {
    let params = new URLSearchParams(location.hash.split('?')[1] || ""); 
    return params.get(param);
}

function getPage(){
	return (location.hash.split('?')[0].slice(1) || 'game');
}