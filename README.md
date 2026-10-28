# Hearing Lab Research

> **Dependencies:** equirements.txt is intentionally empty because this project has no Python packages. Node.js requirements and commands are declared in package.json.

Nguyên mẫu nghiên cứu tự kiểm tra thính lực chạy hoàn toàn trong trình duyệt. Dự án không cần cài thư viện hoặc máy chủ: mở `Tu-do-thinh-luc.html` bằng Chrome/Edge để sử dụng.

## Cấu trúc

```text
.
├── Demo.html                  # Mô phỏng hiệu ứng nghe
├── Tu-do-thinh-luc.html       # Điểm vào bài tự kiểm tra
├── src/
│   ├── app/                   # Luồng giao diện theo tính năng
│   ├── core/                  # Thuật toán thuần, không phụ thuộc DOM
│   ├── storage/               # Kiểm tra và lưu phiên đo
│   └── styles/                # CSS của hai giao diện
├── assets/audio/              # WAV dùng thử và tín hiệu mẫu
├── tests/                     # Kiểm thử Node, không phát âm thanh
├── reports/                   # Kết quả mô phỏng cố định
└── docs/                      # Hướng dẫn, WHO và thiết kế Bayesian
```

Các file trình duyệt dùng script cổ điển để vẫn hoạt động khi mở trực tiếp qua `file://`. Thứ tự script trong `Tu-do-thinh-luc.html` là một phần của hợp đồng ứng dụng. Logic tính toán nằm trong `src/core` và có API CommonJS để kiểm thử độc lập.

## Kiểm thử

Yêu cầu Node.js 20 trở lên:

```powershell
npm test
npm run validation
```

Các lệnh kiểm thử không mở trình duyệt và không phát âm thanh. Báo cáo mô phỏng không thay cho hiệu chuẩn điện–âm hoặc xác thực lâm sàng trên người.

Tài liệu sử dụng: [docs/HUONG-DAN.md](docs/HUONG-DAN.md). Mô hình Bayesian: [docs/BAYESIAN-ACTIVE-LEARNING.md](docs/BAYESIAN-ACTIVE-LEARNING.md).

