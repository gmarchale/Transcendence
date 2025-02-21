document.addEventListener("DOMContentLoaded", function () {
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Enter friend's name";

    const button = document.createElement("button");
    button.textContent = "Add Friend";

    const list = document.createElement("ul");

    button.addEventListener("click", function () {
        const name = input.value.trim();
        if (name) {
            const listItem = document.createElement("li");
            listItem.textContent = name;
            list.appendChild(listItem);
            input.value = ""; // Clear input after adding
        }
    });

    document.body.appendChild(input);
    document.body.appendChild(button);
    document.body.appendChild(list);
});