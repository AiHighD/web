import os
import cv2
import time
import base64
import torch
import numpy as np
from flask import Flask, render_template, Response, request, jsonify
from ultralytics import YOLO
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max upload

# Tạo thư mục uploads nếu chưa tồn tại
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Tải mô hình YOLO 
device = "cuda" if torch.cuda.is_available() else "cpu"
model = None  # Khởi tạo lazy để tránh lỗi khi chạy trên môi trường không có mô hình

# Danh sách nhãn
classNames = ['Giay', 'KimLoai', 'Nhua', 'ThuyTinh', 'Vai']

# Gán màu cho từng lớp
classColors = {
    "Giay": (255, 200, 0),
    "KimLoai": (192, 192, 192),
    "Nhua": (0, 255, 255),
    "ThuyTinh": (0, 128, 255),
    "Vai": (128, 0, 255)
}

# Bộ phát hiện khuôn mặt
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")

# Biến global để kiểm soát webcam stream
camera = None
camera_active = False

# Ngưỡng tin cậy cho từng lớp
CONFIDENCE_THRESHOLDS = {
    'Giay': 0.35,
    'KimLoai': 0.35,
    'Nhua': 0.45,
    'ThuyTinh': 0.45,  # Tăng ngưỡng cho thủy tinh để giảm false positive
    'Vai': 0.3
}

def load_model():
    global model
    if model is None:
        model_path = os.environ.get('MODEL_PATH', 'best.pt')
        try:
            model = YOLO(model_path).to(device)
            print(f"Model đang chạy trên: {next(model.model.parameters()).device}")
        except Exception as e:
            print(f"Lỗi khi tải mô hình: {e}")
            model = None
    return model

def is_background(img, x1, y1, w, h, img_width, img_height):
    """
    Kiểm tra xem vùng được phát hiện có khả năng là background hay không
    """
    # Kiểm tra vị trí (background thường chiếm một phần lớn ảnh hoặc ở viền)
    area_ratio = (w * h) / (img_width * img_height)
    
    is_at_edge = (
        x1 <= 10 or 
        y1 <= 10 or 
        x1 + w >= img_width - 10 or 
        y1 + h >= img_height - 10
    )
    
    # Background thường lớn hoặc ở rìa ảnh
    if area_ratio > 0.4 or (is_at_edge and area_ratio > 0.15):
        return True
        
    # Kiểm tra độ đồng nhất của màu sắc (background thường đồng nhất)
    roi = img[y1:y1+h, x1:x1+w]
    if roi.size == 0:
        return False
        
    # Tính độ lệch chuẩn của màu sắc
    color_std = np.std(roi, axis=(0, 1)).mean()
    if color_std < 25:  # Màu sắc rất đồng nhất -> có thể là background
        return True
        
    return False

def detect_objects(img):
    """Phát hiện đối tượng trong hình ảnh và trả về hình ảnh đã được xử lý và danh sách đối tượng phát hiện"""
    model = load_model()
    if model is None:
        return img, []
    
    detected_objects = []
    img_height, img_width = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, 1.3, 5)
    
    results = model(img, stream=True)
    
    all_boxes = []
    
    for r in results:
        boxes = r.boxes
        for box in boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            w, h = x2 - x1, y2 - y1
            conf = float(box.conf[0])
            cls = int(box.cls[0])
            
            label_name = classNames[cls]
            
            # Áp dụng ngưỡng tin cậy theo từng lớp
            confidence_threshold = CONFIDENCE_THRESHOLDS.get(label_name, 0.45)
            
            if conf < confidence_threshold or w < 30 or h < 30:
                continue
                
            if y2 < img_height * 0.3:  # Bỏ qua đối tượng ở phần trên cùng của ảnh
                continue
            
            # Xử lý đặc biệt cho lớp ThuyTinh
            if label_name == "ThuyTinh":
                # Kiểm tra xem có phải background không
                if is_background(img, x1, y1, w, h, img_width, img_height):
                    continue
                    
                # Kiểm tra chồng lấp với khuôn mặt
                overlap_face = False
                for (fx, fy, fw, fh) in faces:
                    if x1 < fx + fw and x1 + w > fx and y1 < fy + fh and y1 + h > fy:
                        overlap_face = True
                        break
                if overlap_face:
                    continue
                    
            all_boxes.append((cls, conf, x1, y1, w, h))
    
    if not all_boxes:
        cv2.rectangle(img, (20, 20), (img_width - 20, img_height - 20), (255, 255, 255), 2)
        cv2.putText(img, "None", (30, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
    else:
        for cls, conf, x1, y1, w, h in all_boxes:
            label_name = classNames[cls]
            color = classColors.get(label_name, (255, 255, 255))
            
            # Vẽ box và label
            cv2.rectangle(img, (x1, y1), (x1 + w, y1 + h), color, 2)
            cv2.putText(img, f"{label_name} {conf:.2f}", (x1, max(30, y1 - 10)), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
            
            # Thêm đối tượng vào danh sách phát hiện
            detected_objects.append({
                "label": label_name,
                "confidence": float(conf),
                "position": {"x": int(x1), "y": int(y1), "width": int(w), "height": int(h)}
            })
    
    return img, detected_objects

def generate_frames():
    """Generator function cho video stream"""
    global camera, camera_active
    
    if camera is None:
        camera = cv2.VideoCapture(0)
    
    while camera_active:
        success, frame = camera.read()
        if not success:
            break
        else:
            start_time = time.time()
            processed_frame, detected_objects = detect_objects(frame)
            
            # Tính toán FPS thực tế
            fps = 1 / (time.time() - start_time)
            cv2.putText(processed_frame, f"FPS: {fps:.2f}", (20, processed_frame.shape[0] - 20), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            
            # Chuyển đổi frame thành JPEG
            ret, buffer = cv2.imencode('.jpg', processed_frame)
            frame_bytes = buffer.tobytes()
            
            # Trả về frame trong multipart response
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

@app.route('/')
def index():
    """Hiển thị trang chủ"""
    return render_template('index.html')

@app.route('/video_feed')
def video_feed():
    """Route cho video streaming"""
    global camera_active
    camera_active = True
    return Response(generate_frames(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/stop_camera')
def stop_camera():
    """Dừng camera stream"""
    global camera, camera_active
    camera_active = False
    if camera is not None:
        camera.release()
        camera = None
    return jsonify({"status": "success"})

@app.route('/upload', methods=['POST'])
def upload_file():
    """Xử lý tải lên và phát hiện đối tượng trong hình ảnh"""
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    
    if file:
        # Đọc ảnh từ file upload
        file_bytes = file.read()
        nparr = np.frombuffer(file_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        # Phát hiện đối tượng trong ảnh
        processed_img, detected_objects = detect_objects(img)
        
        # Chuyển đổi ảnh đã xử lý thành base64 để hiển thị trên web
        _, buffer = cv2.imencode('.jpg', processed_img)
        img_base64 = base64.b64encode(buffer).decode('utf-8')
        
        return jsonify({
            "status": "success",
            "image": f"data:image/jpeg;base64,{img_base64}",
            "objects": detected_objects
        })

@app.route('/settings', methods=['GET', 'POST'])
def settings():
    """Cấu hình các tham số phát hiện"""
    global CONFIDENCE_THRESHOLDS
    
    if request.method == 'POST':
        # Cập nhật các ngưỡng tin cậy từ form
        data = request.get_json()
        for cls in classNames:
            if cls in data and isinstance(data[cls], (int, float)):
                CONFIDENCE_THRESHOLDS[cls] = float(data[cls])
        return jsonify({"status": "success", "thresholds": CONFIDENCE_THRESHOLDS})
    
    # GET: Trả về các ngưỡng hiện tại
    return jsonify({"thresholds": CONFIDENCE_THRESHOLDS})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)