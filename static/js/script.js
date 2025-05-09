document.addEventListener('DOMContentLoaded', function() {
    // Các phần tử DOM
    const startCameraBtn = document.getElementById('start-camera');
    const stopCameraBtn = document.getElementById('stop-camera');
    const uploadFileBtn = document.getElementById('upload-file');
    const placeholder = document.getElementById('placeholder');
    const uploadedImage = document.getElementById('uploaded-image');
    const videoFeed = document.getElementById('video-feed');
    const loadingIndicator = document.getElementById("loading-indicator");
    const resultsList = document.getElementById('results-list');
    const objectCount = document.getElementById('object-count');
    const processingTime = document.getElementById('processing-time');
    const languageToggle = document.getElementById('language-toggle');
    const langText = document.getElementById('lang-text');

    // Các biến trạng thái
    let cameraActive = false;
    let detectionInterval = null;
    let currentLanguage = localStorage.getItem('language') || 'vi'; // Mặc định là tiếng Việt

    // Các từ điển ngôn ngữ
    const translations = {
        // Bản dịch cho thông báo lỗi và thông báo khác
        en: {
            'Không thể kết nối với camera': 'Unable to connect to camera',
            'Lỗi khi xử lý ảnh': 'Error processing image',
            'Vui lòng chọn một file ảnh': 'Please select an image file',
            'Chưa có dữ liệu nhận diện': 'No detection data yet',
            // Bản dịch cho tên lớp
            'Giay': 'Paper',
            'KimLoai': 'Metal',
            'Nhua': 'Plastic',
            'ThuyTinh': 'Glass',
            'Vai': 'Fabric',
            'None': 'None'
        },
        vi: {
            'Paper': 'Giấy',
            'Metal': 'Kim loại',
            'Plastic': 'Nhựa',
            'Glass': 'Thủy tinh',
            'Fabric': 'Vải',
            'None': 'Không có'
        }
    };

    // Khởi tạo placeholder
    fetch('/static/img/placeholder.jpg')
        .catch(() => {
            console.warn("Không tìm thấy ảnh placeholder, sử dụng màu nền");
            placeholder.style.backgroundColor = "#333";
        });

    // Áp dụng ngôn ngữ đã lưu
    applyLanguage(currentLanguage);

    // Xử lý sự kiện chuyển đổi ngôn ngữ
    languageToggle.addEventListener('click', function() {
        currentLanguage = currentLanguage === 'vi' ? 'en' : 'vi';
        localStorage.setItem('language', currentLanguage);
        applyLanguage(currentLanguage);
    });

    // Hàm áp dụng ngôn ngữ
    function applyLanguage(lang) {
        // Cập nhật nút chuyển đổi ngôn ngữ
        langText.textContent = lang === 'vi' ? 'EN' : 'VI';
        
        // Cập nhật các phần tử có class 'lang'
        document.querySelectorAll('.lang').forEach(element => {
            if (element.dataset[lang]) {
                element.textContent = element.dataset[lang];
            }
        });

        // Cập nhật tiêu đề trang
        document.title = lang === 'vi' ? 'Hệ Thống Phân Loại Vật Liệu Tái Chế' : 'Recyclable Material Sorting System';
        
        // Cập nhật text trong placeholder
        placeholder.alt = lang === 'vi' ? 'Vui lòng tải lên ảnh hoặc bật camera' : 'Please upload an image or start camera';
        
        // Cập nhật text trong uploaded-image
        uploadedImage.alt = lang === 'vi' ? 'Kết quả phân tích' : 'Analysis Result';
        
        // Cập nhật text trong video-feed
        videoFeed.alt = lang === 'vi' ? 'Camera Feed' : 'Camera Feed';
        
        // Cập nhật kết quả hiện tại nếu có
        if (!cameraActive && resultsList.querySelector('.no-results')) {
            resultsList.querySelector('.no-results').textContent = 
                lang === 'vi' ? 'Chưa có dữ liệu nhận diện' : 'No detection data yet';
        }
    }

    // Hàm dịch văn bản
    function translate(text, lang) {
        // Nếu có bản dịch, trả về bản dịch
        if (translations[lang] && translations[lang][text]) {
            return translations[lang][text];
        }
        // Nếu không có bản dịch, trả về văn bản gốc
        return text;
    }

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
            showError(translate('Không thể kết nối với camera', currentLanguage));
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
            alert(translate('Vui lòng chọn một file ảnh', currentLanguage));
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
            showError(translate('Lỗi khi xử lý ảnh', currentLanguage));
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
            noResultsItem.textContent = translate('Chưa có dữ liệu nhận diện', currentLanguage);
            resultsList.appendChild(noResultsItem);
        } else {
            // Hiển thị các đối tượng đã phát hiện
            objects.forEach((obj, index) => {
                const item = document.createElement('li');
                item.className = index === 0 ? 'highlight' : '';
                
                // Dịch nhãn đối tượng theo ngôn ngữ hiện tại
                const translatedLabel = currentLanguage === 'en' ? 
                                        translate(obj.label, currentLanguage) : 
                                        obj.label;
                
                const labelSpan = document.createElement('span');
                labelSpan.className = 'object-label';
                labelSpan.textContent = translatedLabel;
                
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
        noResultsItem.textContent = translate('Chưa có dữ liệu nhận diện', currentLanguage);
        resultsList.appendChild(noResultsItem);
        
        objectCount.textContent = '0';
        processingTime.textContent = '0 ms';
    }

    // Khởi tạo ban đầu
    clearResults();
});