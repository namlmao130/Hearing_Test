# Bản tự kiểm tra thính lực

Mở `Demo.html` rồi chọn **Bắt đầu tự kiểm tra**, hoặc mở trực tiếp `Tu-do-thinh-luc.html` bằng Chrome/Edge.

## Bản 2.0 — tham chiếu WHO

- Trả lời câu hỏi sức khỏe trước khi phát âm thử hoặc bắt đầu bài đo. Luồng hiện tại dành cho người từ 18 tuổi; nghe giảm đột ngột sẽ được hướng dẫn khám ngay, đau/chảy dịch tai cần khám trước khi tự đo.
- Báo cáo bổ sung PTA4 hai tai tại 500/1.000/2.000/4.000 Hz, phân mức WHO 2021 theo tai tốt hơn và cờ nghe kém một bên. Chỉ phân mức khi đủ dữ liệu dB HL, hiệu chuẩn hợp lệ và điều kiện kiểm tra; không dùng dBFS để kết luận mức nghe kém.
- Chọn cách đánh giá nhiễu nền và ghi nhận kết quả/biên bản nếu có. Chỉ tự cảm nhận yên tĩnh cho phép thử đo, nhưng chưa đủ để phân mức. Thông tin do người dùng cung cấp chưa được xác minh độc lập.
- Phiên dở, điểm ngoài dải, thiếu một tai, chất lượng phản hồi chưa đạt hoặc thiếu thông tin mới sẽ có lý do chặn rõ ràng. Lịch sử cũ vẫn được giữ, không tự gán thêm xác nhận.
- JSON lưu câu trả lời sức khỏe, điều kiện đo, dữ liệu gốc và diễn giải có nguồn. Các preset của `Demo.html` chỉ là mô phỏng, không phải phân mức WHO.

Chi tiết quy tắc, nguồn chính thức và những phần cần kiểm định tiếp: [WHO-REFERENCE.md](WHO-REFERENCE.md). Đây là nâng cấp theo tài liệu WHO, **chưa phải sản phẩm được WHO chứng nhận hoặc đã xác thực độ chính xác lâm sàng**.

## Tận dụng mã cũ

- Giữ giao diện mô phỏng, biểu đồ tần số theo thang log, các mức và phần che chữ.
- File giọng nói do người dùng chọn đi qua bộ lọc 6 dải; kéo biểu đồ cập nhật bộ lọc và mức che chữ. Đây là mô phỏng gần đúng bằng EQ, không phải mô hình thính học được kiểm định.
- Text minh họa trong demo không tự đồng bộ transcript của file âm thanh được chọn.
- Trợ lý dùng mẫu giải thích; không có GraphRAG, LLM hay Bayesian đã triển khai.

## Âm đơn

1. Dùng tai nghe, chọn nơi yên tĩnh. Tắt chế độ mono, kiểm tra đúng trái/phải, chọn âm lượng nhỏ và giữ nguyên trong phiên.
2. Chọn một hoặc hai tai. Tám tần số: 250, 500, 1000, 2000, 3000, 4000, 6000, 8000 Hz.
3. Bấm phát rồi trả lời nghe/không nghe. Có nút dừng để giữ phần đã làm.
4. Quy trình dùng 10 dB xuống sau khi nghe và 5 dB lên sau khi không nghe. Ngưỡng cần ít nhất hai phản hồi xác nhận trong chuỗi đi lên tại cùng một mức, tối đa 40 lượt/tần số.
5. Thứ tự: 1000, 2000, 3000, 4000, 6000, 8000, đo lại 1000, rồi 500 và 250 Hz. Nếu hai kết quả 1000 Hz lệch quá 5 dB, phiên bị gắn cờ cần đo lại.
6. Sau mỗi 5–8 phản hồi, hệ thống chèn ngẫu nhiên một lượt im lặng. Báo “nghe thấy” ở lượt này được tính là dương tính giả và làm giảm độ tin cậy nội bộ.
7. Hai lần nghe tại sàn -70 dBFS hoặc không nghe tại trần -10 dBFS được ghi là ngoài dải. Không ép chúng thành một ngưỡng chính xác. Không tự tăng vượt trần.

Khi chưa có hồ sơ hiệu chuẩn, kết quả dùng dBFS **theo biên độ đỉnh của tone số**, không phải dB HL hay dB SPL tại tai nên không so trực tiếp giữa thiết bị hoặc suy ra mức độ mất thính lực. Muốn xuất dB HL phải cố định toàn bộ thiết bị, mức âm lượng và mẫu tai nghe, rồi đo bằng coupler/ear simulator phù hợp và xây offset riêng cho từng tần số/tai nghe theo RETSPL áp dụng. Việc này cần người có chuyên môn và phải được kiểm tra định kỳ.

## Hiệu chuẩn (dBFS → dB HL)

Tab **Hiệu chuẩn** đổi mức phát số (dBFS đỉnh) sang dB HL cho **một bộ thiết bị cụ thể**. Công thức, theo từng tai và từng tần số:

- Âm hiệu chuẩn phát ở −10 dBFS đỉnh, cùng biên độ với mức trần của bài đo.
- Đo SPL của âm đó bằng máy đo mức âm trên coupler/ear simulator đúng loại tai nghe.
- `offset = SPL đo − (−10) − RETSPL`, rồi `dB HL = dBFS + offset`.

Cách làm:

1. Điền tai nghe, máy đo/coupler, nguồn RETSPL, ngày đo, thời hạn (mặc định 12 tháng).
2. Bấm ▶ từng tai/tần số, chờ số đo ổn định rồi nhập SPL. Nhập RETSPL từng tần số lấy từ ISO 389 / ANSI S3.6 hoặc tài liệu hãng cho đúng mẫu tai nghe và coupler. Ứng dụng **không có giá trị RETSPL mặc định** để tránh dùng nhầm bảng.
3. Xem cột offset, dải dB HL và các cảnh báo, rồi **Lưu hồ sơ**. Hồ sơ lưu trong trình duyệt, có thể tải/nhập JSON.
4. Trong bài âm đơn chọn đơn vị **dB HL**, tích xác nhận dùng đúng thiết bị và âm lượng.

Ứng dụng tự áp dụng và kiểm tra:

- Hồ sơ phải đủ 16 số đo SPL và 8 RETSPL, giá trị trong khoảng hợp lý, có ngày hết hạn và chưa quá hạn.
- Mức phát đầu tiên là 40 dB HL; sàn của dải là −10 dB HL; trần không vượt −10 dBFS và **không vượt 90 dB SPL** tại tai nghe theo số đo.
- Cảnh báo nếu sàn cao hơn 0 dB HL (không đo được thính lực bình thường; giảm âm lượng hệ thống) hoặc trần thấp hơn 60 dB HL (không đo được mất thính lực nặng; tăng âm lượng nhưng không vượt giới hạn SPL).
- Chặn dùng hồ sơ khi tần số lấy mẫu hoặc trình duyệt/hệ điều hành khác lúc hiệu chuẩn. Ứng dụng **không đọc được mức âm lượng hệ thống hay phần cứng ra âm thanh**, nên vẫn cần bạn xác nhận bằng tay.
- Kết quả ở sàn/trần được ghi là "≤" / ">" theo dB HL, không ép thành ngưỡng chính xác. Mỗi phiên lưu kèm bản sao hồ sơ hiệu chuẩn lúc đo.

Giới hạn cần biết: đây là hiệu chuẩn tại tần số 8 điểm bằng âm thuần liên tục, không thay hiệu chuẩn điện-âm đầy đủ của máy đo thính lực theo IEC 60645-1. Sai số phụ thuộc máy đo, coupler, độ lặp lại khi đặt tai nghe và độ ổn định của thiết bị phát. Nên hiệu chuẩn lại ít nhất mỗi 12 tháng và sau mọi thay đổi (tai nghe, máy, trình duyệt, cập nhật hệ điều hành, âm lượng). Nên kiểm tra sinh học định kỳ: một người nghe bình thường đã biết ngưỡng làm bài, lệch quá khoảng 10 dB thì đo lại thiết bị. Bài lời nói trong nhiễu không phụ thuộc hiệu chuẩn này vì chỉ dùng SNR.

### Quy tắc của bản tích hợp

- Cùng một bộ kiểm tra hồ sơ được áp dụng khi nhập, lưu và bắt đầu bài đo. Thiếu nguồn RETSPL, ngày đo không hợp lệ hoặc ở tương lai, thiếu môi trường gốc, số đo sai kiểu, ngày hết hạn sai hoặc quá hạn đều không cho dùng dB HL.
- Hồ sơ sai không ghi đè hồ sơ đang dùng. Nhập hồ sơ không tự thay thông tin môi trường, và lưu lại không tự kéo dài thời hạn hiệu lực của hồ sơ nhập.
- Chỉ chọn xác nhận “đã thực hiện đầy đủ số đo SPL” khi thực sự đo lại bằng thiết bị đo trên bộ thiết bị hiện tại. Khi đó ứng dụng mới ghi nhận môi trường mới. Một lần bấm lưu không phải là hiệu chuẩn vật lý.
- Phát tone hiệu chuẩn cần xác nhận tai nghe nằm trên coupler, có nút dừng riêng, tự dừng sau 10 giây và dừng khi chuyển tab. Giới hạn SPL của bài đo được tính từ số đo người dùng nhập, không phải phép đo âm thanh trực tiếp.
- Phiên còn thiếu tần số, có điểm chưa xác định hoặc thiếu lần kiểm tra lại ở một tai sẽ không được báo “Độ tin cậy nội bộ đạt”. Nhãn này không chứng minh độ chính xác lâm sàng.
- Hiệu chuẩn một mức chưa kiểm chứng độ tuyến tính toàn dải. Speech-in-noise vẫn chịu ảnh hưởng của mức phát thực tế, phổ thiết bị, nội dung câu và môi trường; SNR số đúng chưa đủ để chứng minh khả năng đo lường của bài kiểm tra.

### Kiểm tra phần mềm

Chạy `node verify.cjs` trong thư mục chứa `Demo.html`, `Tu-do-thinh-luc.html` và `hearing-core.js`. Bộ kiểm tra gồm thuật toán ngưỡng, quy đổi đơn vị, giới hạn SPL, dữ liệu nhập hỏng, ngày hiệu chuẩn, phiên thiếu kết quả và việc giữ nguyên môi trường gốc khi lưu hồ sơ nhập. Đây là kiểm thử mã, chưa phải kiểm định bằng thiết bị âm học hoặc người tham gia.

## Lời nói trong nhiễu

- Chuẩn bị ít nhất 3 câu sạch khác nhau và transcript khớp từng file. Có thể bắt đầu với các WAV sẵn có nếu tự kiểm tra và điền đúng transcript.
- Âm thanh được giải mã cục bộ; không upload. Mỗi câu dài 0,3–30 giây, file tối đa 20 MB. Các câu được xáo trộn, mỗi câu dùng một lần.
- Trộn nhiễu trắng theo RMS toàn file: bắt đầu +15 dB SNR, trả lời đúng giảm 3 dB, sai tăng 3 dB; giới hạn -9 đến +18 dB.
- Scale chung cả speech và noise để giữ SNR và hạn chế clipping. Mức phát tuyệt đối chưa hiệu chuẩn; SNR tính toàn file có thể bị ảnh hưởng bởi khoảng lặng trong bản ghi. Nên cắt khoảng lặng dài trước khi dùng.
- Chấm đúng toàn câu, bỏ qua dấu câu/viết hoa/khoảng trắng, giữ dấu tiếng Việt. Lỗi gõ vẫn có thể ảnh hưởng điểm. Transcript được ẩn trong khi làm bài và chỉ hiện sau khi trả lời.
- Báo cáo điểm theo từng SNR, chưa ước lượng SRT đã kiểm định và không đổi thành audiogram. Việc người làm bài tự chuẩn bị transcript có thể gây nhớ đáp án; nên nhờ người khác chuẩn bị bộ câu khi thử nghiệm nghiêm túc.

## Lưu kết quả

- Tự lưu sau mỗi câu trả lời bằng localStorage trong trình duyệt hiện tại.
- Lịch sử có xem lại biểu đồ/bảng, tải JSON và xóa từng phiên có xác nhận.
- JSON gồm lượt thử, kết quả, trạng thái hoàn thành/dừng, đơn vị và cấu hình. Không lưu file audio trong lịch sử.
- Nếu lưu trình duyệt bị chặn hoặc đầy, trang hiện thông báo; tải JSON để giữ bản sao.
- Khi tải lại trang, phiên chưa hoàn thành được đánh dấu gián đoạn; chưa có chức năng tiếp tục phiên cũ. Di chuyển file, đổi trình duyệt hoặc xóa dữ liệu trình duyệt có thể ảnh hưởng lịch sử.

## Bước phát triển tiếp theo

Hiệu chuẩn thiết bị, kiểm soát môi trường đo theo mức nhiễu cho phép, kiểm tra độ tin cậy/phản hồi giả, bộ câu hoặc digit-triplet được thu và xác thực đồng nhất, đối chiếu với máy đo thính lực chuẩn trên đủ số người, sau đó mới bổ sung Bayesian/Active Learning và đánh giá sai số cùng số lượt/thời gian so với baseline.

## Tài liệu tham chiếu

- ASHA, *Guidelines for Manual Pure-Tone Threshold Audiometry*: https://www.asha.org/policy/GL2005-00014/
- ASHA, *Adult Hearing Screening*: https://www.asha.org/practice-portal/professional-issues/adult-hearing-screening/
- ISO 389, reference zero and RETSPL for audiometric calibration: https://www.iso.org/standard/69855.html
- WHO hearWHO, validated digits-in-noise screening: https://www.who.int/teams/noncommunicable-diseases/sensory-functions-disability-and-rehabilitation/hearwho/
