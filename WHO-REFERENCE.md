# Phạm vi tham chiếu WHO của Hearing Lab

Bản 2.0 — đối chiếu tài liệu ngày 26/10/2026.

Ứng dụng triển khai **phân mức tham chiếu WHO 2021 từ PTA4**, kèm điều kiện chất lượng dữ liệu và hướng dẫn chuyển khám. Ứng dụng chưa được kiểm định lâm sàng, chưa được WHO chứng nhận và không phải ứng dụng hearWHO. Kiểm thử phần mềm không chứng minh độ chính xác đo thính lực trên người.

## Quy tắc phân mức

Nguồn: WHO, *World report on hearing* (2021), bảng 1.3. Bảng này cũng được WHO trình bày lại trong phụ lục 1 của *Hearing aid service delivery approaches for low- and middle-income settings*.

`PTA4_tai = (HL_500 + HL_1000 + HL_2000 + HL_4000) / 4`.

Tính riêng từng tai, chọn giá trị thấp hơn để phân mức. Dùng lần đo chính; lần đo lại 1.000 Hz kiểm tra tính lặp lại, không được tính thành tần số thứ năm. Giữ nguyên giá trị trung bình trước khi so ngưỡng; chỉ định dạng số khi hiển thị.

| PTA4 tai nghe tốt hơn, dB HL | Phân mức tham chiếu |
| --- | --- |
| <20 | Trong khoảng bình thường theo PTA4 |
| 20 đến <35 | Nhẹ |
| 35 đến <50 | Trung bình |
| 50 đến <65 | Trung bình–nặng |
| 65 đến <80 | Nặng |
| 80 đến <95 | Sâu |
| ≥95 | Hoàn toàn |

Tiêu chí một bên trong bảng WHO: PTA4 tai tốt <20 và tai còn lại ≥35 dB HL. Ứng dụng hiển thị cờ này riêng, tránh che khuất tai kém khi tai tốt nằm trong khoảng bình thường. Đây là dấu hiệu từ phép sàng lọc, không xác nhận chẩn đoán một bên: chưa có che lấp tai đối bên.

PTA4 thấp không loại trừ khó nghe trong nhiễu, giảm nghe ở tần số ngoài PTA4, hoặc khó khăn của tai còn lại. Bảng phân mức không phải tiêu chuẩn chỉ định máy trợ thính hay xác định nguyên nhân mất thính lực.

## Các điều kiện riêng của ứng dụng

Những điều kiện sau là lựa chọn triển khai thận trọng của dự án, **không phải một quy trình do WHO thẩm định**:

- Phiên dùng Bayesian/Active Learning bị chặn phân mức WHO trong bản hiện tại. Engine có thể tạo ngưỡng dB HL sau hiệu chuẩn, nhưng chưa được kiểm định lâm sàng; khoảng hậu nghiệm của mô hình không thay cho bằng chứng độ chính xác. Chế độ staircase đối chiếu vẫn phải qua toàn bộ gate dưới đây.

- Phạm vi tự đo từ 18 tuổi. Cần trả lời đầy đủ câu hỏi sức khỏe trước khi phát âm thử/đo; đau hoặc chảy dịch tai thì hướng dẫn khám trước, nghe giảm đột ngột thì hướng dẫn khám ngay.
- Chỉ phân mức với phiên âm đơn hoàn thành, cả hai tai, đơn vị dB HL và hồ sơ hiệu chuẩn hợp lệ trong toàn bộ thời gian phiên. Hồ sơ hết hạn sau ngày đo không tự làm mất giá trị lịch sử; hồ sơ hết hạn trong phiên thì chặn phân mức.
- Cần xác nhận đúng thiết bị, âm lượng, môi trường; lưu tần số lấy mẫu và trình duyệt tại lúc đo để đối chiếu hồ sơ.
- Cần ghi nhận phương pháp/kết quả hoặc mã biên bản đánh giá nhiễu nền. Chỉ đánh dấu “tôi thấy yên tĩnh” vẫn cho phép thử đo nhưng không đủ để phân mức WHO. Ghi nhận này do người dùng nhập, không phải bằng chứng được phần mềm kiểm chứng.
- Cần đủ tám tần số mỗi tai và đo lại 1.000 Hz; kết quả lặp lại lệch không quá 5 dB; ít nhất hai lượt im lặng và không báo nghe ở các lượt này. Bước tìm ngưỡng 10 dB xuống/5 dB lên và các kiểm tra này là quy tắc triển khai riêng, không gán cho WHO.
- Không tính PTA4 từ ngưỡng ngoài dải (`≤`/`>`), thiếu, trùng lặp, sai kiểu hoặc không khớp quy đổi dBFS–dB HL. Không suy đoán dB HL từ dBFS.
- Giới hạn phát hiện tại giữ nguyên; không tăng trần âm để cố đo tới tất cả mức trong bảng WHO. Độ sâu lớn nhất đo được tùy chuỗi thiết bị và RETSPL.
- Có ngưỡng tăng ở một tai/tần số hoặc tự báo khó nghe thì đề nghị đánh giá chuyên môn; đây là hướng dẫn thận trọng của dự án, không phải ngưỡng pass/refer WHO được xác thực.

## Lưu trữ và khả năng truy nguyên

Phiên mới lưu `appVersion`, `intake`, thông tin thiết bị/môi trường trong `config`, bản sao hiệu chuẩn, kết quả từng tần số, lượt phản hồi và `interpretation`. Báo cáo dẫn nguồn, phiên bản thuật toán, PTA4 hai tai, tai tốt hơn, phân mức, cờ một bên, lý do chặn và hướng dẫn tiếp theo.

Xem lại và xuất JSON luôn tính lại diễn giải từ dữ liệu gốc; không tin nhãn phân mức đã lưu. Phiên cũ vẫn mở được, nhưng thiếu thông tin mới sẽ hiện lý do chưa đủ điều kiện. Không tự thêm xác nhận sức khỏe/môi trường vào phiên cũ. Không thay khóa lịch sử `hearing-lab-sessions-v1`.

Dữ liệu nằm trong localStorage của trình duyệt. File JSON chứa cả câu trả lời sức khỏe và ghi chú thiết bị; người dùng chủ động chọn chia sẻ. Có thể xóa từng phiên trong lịch sử.

## Điều còn phải làm trước khi đánh giá sử dụng lâm sàng

1. Kiểm chứng điện–âm bằng thiết bị chuẩn: mức phát, tuyến tính toàn dải, tần số, độ méo, kênh trái/phải, rò kênh, độ lặp lại khi đặt tai nghe; đánh giá nhiễu nền theo từng dải tần và loại tai nghe. Hiệu chuẩn một mức trên coupler hiện tại chưa đủ chứng minh toàn bộ hệ thống.
2. Có quy trình chuyên môn cho khám tai, đường xương, che lấp, triệu chứng và chuyển tuyến; đánh giá riêng trẻ em thay vì dùng lại luồng người lớn.
3. So sánh với đo thính lực tham chiếu tại cơ sở chuyên khoa trên nhóm người tham gia phù hợp. Định trước tiêu chí sai số, độ lặp lại, độ nhạy/độ đặc hiệu của quyết định chuyển khám và xử lý dữ liệu ngoài dải; báo cáo khoảng tin cậy. Chưa có dữ liệu này nên không đưa ra tỷ lệ “chính xác” của dự án.
4. Bài nghe câu tiếng Việt trong nhiễu hiện chỉ là thử nghiệm. Muốn xác thực cần ngân hàng kích thích được chuẩn hóa, phổ nhiễu, độ tương đương câu và đánh giá thực nghiệm; không mượn điểm hoặc số liệu độ chính xác của hearWHO.

## Nguồn chính thức

- WHO: [World report on hearing, 2021](https://www.who.int/publications/i/item/9789240020481), bảng 1.3.
- WHO: [Hearing aid service delivery approaches, phụ lục 1](https://iris.who.int/bitstream/handle/10665/376092/9789240087927-eng.pdf).
- WHO: [Hearing screening: considerations for implementation](https://www.who.int/publications/i/item/9789240032767): tổ chức sàng lọc và can thiệp theo nhóm tuổi; không phải chứng nhận ứng dụng.
- WHO: [Hearing checks and the hearWHO app](https://www.who.int/news-room/questions-and-answers/item/deafness-and-hearing-loss-hearing-checks-and-the-hearwho-app): hearWHO dùng digits-in-noise và không thay thế đánh giá chuyên môn. Không áp dụng điểm hearWHO cho bài nghe câu của dự án.
- WHO: [Ear care](https://www.who.int/news-room/questions-and-answers/item/deafness-and-hearing-loss-ear-care/): đau tai, chảy dịch hoặc khó nghe cần gặp nhân viên y tế.
- NIDCD: [Sudden deafness](https://www.nidcd.nih.gov/health/sudden-deafness): căn cứ bổ sung cho hướng dẫn khám ngay khi nghe giảm đột ngột; không gán hướng dẫn này cho bảng phân mức WHO.

## Kiểm tra mã nguồn

Chạy `node verify.cjs`. Bộ kiểm tra bao gồm các thuật toán cũ, biên phân mức WHO, PTA4 chưa làm tròn, tiêu chí một bên, dữ liệu ngoài dải/thiếu/trùng, hiệu chuẩn theo thời gian phiên, dữ liệu lịch sử, chặn bắt đầu theo câu hỏi sức khỏe và hiển thị báo cáo. Các kiểm tra không phát âm thanh hoặc thao tác trình duyệt và không thay kiểm định âm học/lâm sàng.
