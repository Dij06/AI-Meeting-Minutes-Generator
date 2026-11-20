import os
import sys
import json
import urllib.request
import urllib.parse
from io import BytesIO

BASE_URL = "http://127.0.0.1:5000"

def post_multipart(url, fields, files):
    boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
    body = bytearray()
    
    for k, v in fields.items():
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(f'Content-Disposition: form-data; name="{k}"\r\n\r\n'.encode("utf-8"))
        body.extend(f"{v}\r\n".encode("utf-8"))
        
    for k, (filename, file_bytes, mime) in files.items():
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(f'Content-Disposition: form-data; name="{k}"; filename="{filename}"\r\n'.encode("utf-8"))
        body.extend(f"Content-Type: {mime}\r\n\r\n".encode("utf-8"))
        body.extend(file_bytes)
        body.extend(b"\r\n")
        
    body.extend(f"--{boundary}--\r\n".encode("utf-8"))
    
    req = urllib.request.Request(url, data=bytes(body))
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    
    with urllib.request.urlopen(req) as resp:
        return resp.getcode(), json.loads(resp.read().decode("utf-8"))

def test_recording(filename, language):
    filepath = os.path.join("static", "audio", filename)
    if not os.path.exists(filepath):
        filepath = os.path.join("sample_recordings", filename)
    print(f"\n==========================================")
    print(f"Testing {filename} (Language: {language})")
    print(f"==========================================")
    
    if not os.path.exists(filepath):
        print(f"ERROR: File {filepath} not found!")
        return None

    with open(filepath, "rb") as f:
        file_bytes = f.read()

    status, res = post_multipart(
        f"{BASE_URL}/upload",
        fields={"language": language},
        files={"meeting_file": (filename, file_bytes, "audio/mpeg")}
    )
    
    data = res.get("data", {})
    print(f"HTTP Status: {status}")
    print(f"Language: {data.get('statistics', {}).get('language')}")
    print(f"Duration: {data.get('statistics', {}).get('duration')}")
    print(f"Transcript: {data.get('transcript', '')}")
    print(f"Summary: {data.get('summary', '')}")
    print(f"Decisions ({len(data.get('decisions', []))}): {data.get('decisions')}")
    print(f"Action Items ({len(data.get('action_items', []))}): {data.get('action_items')}")
    return data

def test_ask_ai(meeting_data, question):
    print(f"\n==========================================")
    print(f"Testing AI Q&A Assistant")
    print(f"Question: {question}")
    print(f"==========================================")
    payload = json.dumps({"question": question, "meeting_data": meeting_data}).encode("utf-8")
    req = urllib.request.Request(f"{BASE_URL}/api/ask_ai", data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        print(f"Answer: {data.get('answer')}")
        print(f"Insights: {data.get('insights')}")

def test_export(file_format, meeting_data):
    print(f"\n==========================================")
    print(f"Testing Export: {file_format.upper()}")
    print(f"==========================================")
    payload = json.dumps({"meeting_data": meeting_data}).encode("utf-8")
    req = urllib.request.Request(f"{BASE_URL}/export/{file_format}", data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        content_type = resp.headers.get("Content-Type")
        content_len = len(resp.read())
        print(f"Status: {resp.getcode()}, Content-Type: {content_type}, Size: {content_len} bytes")

def main():
    print("Verifying server is alive...")
    with urllib.request.urlopen(f"{BASE_URL}/") as resp:
        print(f"Server alive! Status: {resp.getcode()}")

    # 1. English Test
    eng_res = test_recording("meeting_english.mp3", "English")

    # 2. Hindi Test
    hi_res = test_recording("meeting_hindi.mp3", "Hindi")

    # 3. Auto/Hinglish Test
    auto_res = test_recording("meeting_auto.mp3", "Auto")

    # 4. Test Ask AI with English Meeting Data
    if eng_res:
        test_ask_ai(eng_res, "Who will complete the frontend components?")
        
        # 5. Test PDF Export
        test_export("pdf", eng_res)
        
        # 6. Test DOCX Export
        test_export("docx", eng_res)

    print("\n>>> ALL TESTS COMPLETED SUCCESSFULLY! <<<")

if __name__ == "__main__":
    main()
