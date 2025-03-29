function loadPlay() {
    console.log("Loading play.");

    if (gameInitialized == false) {
        window.location.href = `#game`;
        return;
    }

    if (game) {
        console.log("game existe!");
    }

    const hash = window.location.hash;
    const match = hash.match(/#play\/(\d+)/);

    if (!match) {
        console.warn("No game ID found in URL.");
        window.location.href = "#game";
        return;
    }

    const gameId = match[1];
    console.log("Checking game status for ID:", gameId);

    fetch(`/api/game/play/${gameId}/`, {
        method: "GET",
        headers: {
            "X-Requested-With": "XMLHttpRequest"
        },
        credentials: "include"
    })
    .then(response => {
        if (!response.ok) {
            throw new Error("Failed to fetch game status");
        }
        return response.json();
    })
    .then(data => {
		console.log("Game status :", data.game.status);
        if (data.game.status == "finished") {
            console.warn("Game ended or not found.");
            window.location.href = "#game";
        }
    })
    .catch(error => {
        console.error("Error checking game status:", error);
        window.location.href = "#game";
    });
}
