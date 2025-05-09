// Lưu trữ các bản dịch cho hệ thống
const translations = {
    'vi': {
        'title': 'Hệ thống Nhận diện Vật liệu',
        'subtitle': 'Nhận diện các loại vật liệu: Giấy, Kim loại, Nhựa, Thủy tinh, Vải',
        'switch_lang': 'English',
        'start_camera': 'Bật Camera',
        'stop_camera': 'Tắt Camera',
        'upload_image': 'Tải ảnh lên',
        'result_heading': 'Kết quả nhận diện',
        'no_results': 'Chưa có dữ liệu nhận diện',
        'object_count_label': 'Số đối tượng: ',
        'processing_time_label': 'Thời gian xử lý: ',
        'legend_heading': 'Chú thích màu',
        'paper': 'Giấy',
        'metal': 'Kim loại',
        'plastic': 'Nhựa',
        'glass': 'Thủy tinh',
        'fabric': 'Vải',
        'footer_text': 'Hệ thống Nhận diện vật liệu tái chế',
        'placeholder_alt': 'Vui lòng tải lên ảnh hoặc bật camera',
        'result_alt': 'Kết quả phân tích',
        'camera_feed_alt': 'Camera Feed'
    },
    'en': {
        'title': 'Material Recognition System',
        'subtitle': 'Recognizing materials: Paper, Metal, Plastic, Glass, Fabric',
        'switch_lang': 'Tiếng Việt',
        'start_camera': 'Start Camera',
        'stop_camera': 'Stop Camera',
        'upload_image': 'Upload Image',
        'result_heading': 'Detection Results',
        'no_results': 'No detection data available',
        'object_count_label': 'Object count: ',
        'processing_time_label': 'Processing time: ',
        'legend_heading': 'Color Legend',
        'paper': 'Paper',
        'metal': 'Metal',
        'plastic': 'Plastic',
        'glass': 'Glass',
        'fabric': 'Fabric',
        'footer_text': 'Material Recognition System for Recycling',
        'placeholder_alt': 'Please upload an image or start the camera',
        'result_alt': 'Analysis Results',
        'camera_feed_alt': 'Camera Feed'
    }
};

// Hàm lấy ngôn ngữ hiện tại từ localStorage hoặc sử dụng mặc định
function getCurrentLanguage() {
    return localStorage.getItem('language') || 'vi';
}

// Hàm thiết lập ngôn ngữ
function setLanguage(lang) {
    localStorage.setItem('language', lang);
    document.documentElement.lang = lang;
    updateContent();
}

// Cập nhật nội dung trang theo ngôn ngữ hiện tại
function updateContent() {
    const currentLang = getCurrentLanguage();
    const elements = document.querySelectorAll('[data-translate]');
    
    elements.forEach(element => {
        const key = element.getAttribute('data-translate');
        if (translations[currentLang] && translations[currentLang][key]) {
            // Kiểm tra nếu là thuộc tính alt
            if (element.hasAttribute('alt')) {
                element.setAttribute('alt', translations[currentLang][key]);
            } else {
                element.textContent = translations[currentLang][key];
            }
        }
    });
}

// Hàm chuyển đổi giữa tiếng Việt và tiếng Anh
function toggleLanguage() {
    const currentLang = getCurrentLanguage();
    const newLang = currentLang === 'vi' ? 'en' : 'vi';
    setLanguage(newLang);
}

// Khởi tạo khi tài liệu đã tải xong
document.addEventListener('DOMContentLoaded', function() {
    // Thiết lập ngôn ngữ từ localStorage (nếu có)
    const savedLang = localStorage.getItem('language');
    if (savedLang) {
        setLanguage(savedLang);
    } else {
        // Mặc định là tiếng Việt
        setLanguage('vi');
    }
    
    // Thêm sự kiện click cho nút chuyển đổi ngôn ngữ
    const languageToggle = document.getElementById('language-toggle');
    if (languageToggle) {
        languageToggle.addEventListener('click', toggleLanguage);
    }
});