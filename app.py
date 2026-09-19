from flask import Flask, render_template, request, jsonify
import os

app = Flask(__name__)

UPLOAD_FOLDER = "uploads"

app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER

os.makedirs(UPLOAD_FOLDER, exist_ok=True)


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/upload", methods=["POST"])
def upload_file():

    if "meeting_file" not in request.files:
        return jsonify({
            "error": "No file was uploaded."
        }), 400

    file = request.files["meeting_file"]

    if file.filename == "":
        return jsonify({
            "error": "No file was selected."
        }), 400

    file_path = os.path.join(
        app.config["UPLOAD_FOLDER"],
        file.filename
    )

    file.save(file_path)

    return jsonify({
        "message": f"File '{file.filename}' uploaded successfully."
    })


if __name__ == "__main__":
    app.run(debug=True)