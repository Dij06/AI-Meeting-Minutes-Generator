const fileInput = document.getElementById("meetingFile");
const generateButton = document.getElementById("generateBtn");
const fileName = document.getElementById("fileName");

fileInput.addEventListener("change", function () {

    if (fileInput.files.length > 0) {
        fileName.textContent = "Selected file: " + fileInput.files[0].name;
    } else {
        fileName.textContent = "";
    }

});


generateButton.addEventListener("click", async function () {

    if (fileInput.files.length === 0) {
        alert("Please select a meeting recording first.");
        return;
    }

    const file = fileInput.files[0];

    const formData = new FormData();
    formData.append("meeting_file", file);

    generateButton.textContent = "Uploading...";
    generateButton.disabled = true;

    try {

        const response = await fetch("/upload", {
            method: "POST",
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            alert(data.message);
        } else {
            alert(data.error);
        }

    } catch (error) {

        console.error(error);
        alert("Something went wrong.");

    } finally {

        generateButton.textContent = "Generate Minutes";
        generateButton.disabled = false;

    }

});