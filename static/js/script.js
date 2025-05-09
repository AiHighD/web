document.addEventListener('DOMContentLoaded', function() {
    // Các phần tử DOM
    const startCameraBtn = document.getElementById('start-camera');
    const stopCameraBtn = document.getElementById('stop-camera');
    const uploadFileBtn = document.getElementById('upload-file');
    const placeholder = document.getElementById('placeholder');
    const uploadedImage = document.getElementById('uploaded-image');
    const videoFeed = document.getElementById('video-feed');
    const loadingIndicator = document.getElementById('loading-indicator');
    const resultsList = document.getElementById('results-list');
    const objectCount = document.getElementById('object-count');
    const processingTime = document.getElementById('processing-time');

    // Các biến trạng thái
    let cameraActive = false;
    let detectionInterval = null;

    // Khởi tạo placeholder
    fetch('/static/img/placeholder.jpg')
        .catch(() => {
            console.warn("Không tìm thấy ảnh placeholder, sử dụng màu nền");
            placeholder.style.backgroundColor = "#333";
        });

    // Xử lý bật camera
    startCameraBtn.addEventListener('click', function() {
        if (cameraActive) return;
        
        showLoading(true);
        cameraActive = true;
        placeholder.classList.add('hidden');
        uploadedImage.classList.add('hidden');
        videoFeed.classList.remove('hidden');
        videoFeed.src = "/video_feed";
        
        startCameraBtn.disabled = true;
        stopCameraBtn.disabled = false;
        
        // Khi video stream đã sẵn sàng
        videoFeed.onload = function() {
            showLoading(false);
            
            // Bắt đầu theo dõi kết quả nhận diện từ video stream
            startDetectionPolling();
        };
        
        videoFeed.onerror = function() {
            showError("Không thể kết nối với camera");
            stopCamera();
        };
    });

    // Xử lý tắt camera
    stopCameraBtn.addEventListener('click', stopCamera);

    // Hàm dừng camera
    function stopCamera() {
        if (!cameraActive) return;
        
        fetch('/stop_camera')
            .then(response => response.json())
            .then(data => {
                console.log("Camera đã dừng:", data);
                cameraActive = false;
                
                videoFeed.classList.add('hidden');
                placeholder.classList.remove('hidden');
                
                startCameraBtn.disabled = false;
                stopCameraBtn.disabled = true;
                
                if (detectionInterval) {
                    clearInterval(detectionInterval);
                    detectionInterval = null;
                }
                
                // Xóa kết quả nhận diện
                clearResults();
            })
            .catch(error => {
                console.error("Lỗi khi dừng camera:", error);
            });
    }

    // Xử lý tải ảnh lên
    uploadFileBtn.addEventListener('change', function(e) {
        if (e.target.files.length === 0) return;
        
        // Nếu camera đang bật, tắt camera trước
        if (cameraActive) {
            stopCamera();
        }
        
        const file = e.target.files[0];
        if (!file.type.match('image.*')) {
            alert('Vui lòng chọn một file ảnh');
            return;
        }
        
        showLoading(true);
        
        const formData = new FormData();
        formData.append('file', file);
        
        const startTime = performance.now();
        
        fetch('/upload', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Lỗi khi tải ảnh lên');
            }
            return response.json();
        })
        .then(data => {
            const endTime = performance.now();
            const processingTimeMs = endTime - startTime;
            
            // Hiển thị ảnh đã xử lý
            placeholder.classList.add('hidden');
            videoFeed.classList.add('hidden');
            uploadedImage.classList.remove('hidden');
            uploadedImage.src = data.image;
            
            // Hiển thị kết quả
            updateResults(data.objects, processingTimeMs);
            
            // Reset input file để có thể tải cùng một file lên lại
            uploadFileBtn.value = '';
        })
        .catch(error => {
            console.error('Lỗi:', error);
            showError("Lỗi khi xử lý ảnh");
        })
        .finally(() => {
            showLoading(false);
        });
    });

    // Hàm bắt đầu theo dõi kết quả nhận diện từ video stream
    function startDetectionPolling() {
        if (detectionInterval) {
            clearInterval(detectionInterval);
        }
        
        // Thực hiện một yêu cầu nhận diện mỗi 1 giây
        detectionInterval = setInterval(() => {
            if (!cameraActive) {
                clearInterval(detectionInterval);
                detectionInterval = null;
                return;
            }
            
            // Tạo canvas để lấy frame hiện tại từ video
            const canvas = document.createElement('canvas');
            canvas.width = videoFeed.naturalWidth || 640;
            canvas.height = videoFeed.naturalHeight || 480;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(videoFeed, 0, 0, canvas.width, canvas.height);
            
            // Chuyển đổi canvas thành blob
            canvas.toBlob(blob => {
                if (!blob || !cameraActive) return;
                
                const formData = new FormData();
                formData.append('file', blob, 'snapshot.jpg');
                
                const startTime = performance.now();
                
                fetch('/upload', {
                    method: 'POST',
                    body: formData
                })
                .then(response => response.json())
                .then(data => {
                    if (!cameraActive) return;
                    
                    const endTime = performance.now();
                    const processingTimeMs = endTime - startTime;
                    
                    // Cập nhật kết quả từ frame hiện tại
                    updateResults(data.objects, processingTimeMs);
                })
                .catch(error => {
                    console.error("Lỗi khi nhận diện frame:", error);
                });
                
            }, 'image/jpeg', 0.8);
            
        }, 1000); // 1 giây/lần
    }

    // Hàm cập nhật kết quả nhận diện
    function updateResults(objects, timeMs) {
        // Cập nhật số lượng đối tượng và thời gian xử lý
        objectCount.textContent = objects.length;
        processingTime.textContent = `${timeMs.toFixed(0)} ms`;
        
        // Xóa danh sách kết quả cũ
        resultsList.innerHTML = '';
        
        if (objects.length === 0) {
            const noResultsItem = document.createElement('li');
            noResultsItem.className = 'no-results';
            noResultsItem.textContent = 'Chưa có dữ liệu nhận diện';
            resultsList.appendChild(noResultsItem);
        } else {
            // Hiển thị các đối tượng đã phát hiện
            objects.forEach((obj, index) => {
                const item = document.createElement('li');
                item.className = index === 0 ? 'highlight' : '';
                
                const labelSpan = document.createElement('span');
                labelSpan.className = 'object-label';
                labelSpan.textContent = obj.label;
                
                const confidenceBar = document.createElement('div');
                confidenceBar.className = 'confidence-bar';
                
                const confidenceLevel = document.createElement('div');
                confidenceLevel.className = 'confidence-level';
                confidenceLevel.style.width = `${obj.confidence * 100}%`;
                
                const confidenceValue = document.createElement('span');
                confidenceValue.className = 'confidence-value';
                confidenceValue.textContent = `${(obj.confidence * 100).toFixed(1)}%`;
                
                confidenceBar.appendChild(confidenceLevel);
                item.appendChild(labelSpan);
                item.appendChild(confidenceBar);
                item.appendChild(confidenceValue);
                
                resultsList.appendChild(item);
            });
        }
    }

    // Hàm hiển thị loading indicator
    function showLoading(show) {
        if (show) {
            loadingIndicator.classList.remove('hidden');
        } else {
            loadingIndicator.classList.add('hidden');
        }
    }

    // Hàm hiển thị lỗi
    function showError(message) {
        clearResults();
        const errorItem = document.createElement('li');
        errorItem.className = 'no-results';
        errorItem.style.color = 'red';
        errorItem.textContent = message;
        resultsList.appendChild(errorItem);
    }

    // Hàm xóa kết quả
    function clearResults() {
        resultsList.innerHTML = '';
        const noResultsItem = document.createElement('li');
        noResultsItem.className = 'no-results';
        noResultsItem.textContent = 'Chưa có dữ liệu nhận diện';
        resultsList.appendChild(noResultsItem);
        
        objectCount.textContent = '0';
        processingTime.textContent = '0 ms';
    }

    // Khởi tạo ban đầu
    clearResults();
});