# Bayesian/Active Learning — bản nghiên cứu v2

## Mục tiêu và phạm vi

Engine `bayesian-threshold-v2` ước lượng ngưỡng nghe riêng cho từng tai và từng tần số từ phản hồi nghe/không nghe. Sau mỗi phản hồi, nó chọn mức âm hợp lệ có lượng thông tin kỳ vọng lớn nhất về ngưỡng. “Tối ưu” ở đây chỉ có nghĩa là tối đa hóa tiêu chí thông tin trong mô hình đã khai báo; không có nghĩa là đã tối ưu hoặc xác thực trên người dùng thực.

Thiết kế dựa trên hướng nghiên cứu Bayesian active learning cho đo thính lực, trong đó ngưỡng được biểu diễn bằng phân phối xác suất, kích thích tiếp theo được chọn theo thông tin kỳ vọng và kết quả có khoảng bất định. Nguồn phương pháp chính:

- Song XD, Garnett R, Barbour DL. [Psychometric function estimation by probabilistic classification](https://doi.org/10.1121/1.5047436), *JASA* 2018 — audiogram estimation using Bayesian active learning.
- Cox M, de Vries B. [Bayesian Pure-Tone Audiometry Through Active Learning Under Informed Priors](https://doi.org/10.3389/fdgth.2021.723348), 2021.

Dự án này là một triển khai độc lập, đơn giản hơn các mô hình Gaussian Process trong nghiên cứu: chưa dùng prior học từ dữ liệu lâm sàng và chưa suy luận chéo giữa các tần số.

## Mô hình hiện tại

- Ngưỡng là mức mà xác suất trả lời “nghe thấy” bằng 50%.
- Prior ngưỡng là phân phối đều rời rạc, mở rộng 30 dB ra ngoài mỗi biên phát để mô hình có thể kết luận ngưỡng ngoài dải thay vì ép về biên.
- Hàm tâm lý là logistic. Engine lấy trung bình Bayes trên lưới độ dốc 1,5/3/6 dB và xác suất dương tính giả/lapse 0,01/0,05/0,15.
- Candidate phát nằm trên lưới 5 dB cùng hai biên hiệu chuẩn chính xác. Candidate không bao giờ vượt `min/max`, không tăng quá 10 dB so với lượt trước và không được tự làm tròn qua giới hạn SPL.
- Active Learning chọn candidate tối đa hóa mutual information giữa phản hồi kế tiếp và ngưỡng, sau khi lấy trung bình trên nuisance parameters. Nó không dùng riêng entropy của phản hồi.
- Mỗi điểm cần ít nhất 12 lượt âm. Một ước lượng chỉ được chấp nhận khi khoảng hậu nghiệm equal-tail 95% rộng không quá 10 dB, nằm trọn trong dải phát, có ít nhất hai lần không nghe dưới ngưỡng giữa và hai lần nghe trên ngưỡng giữa, và chuỗi phản hồi không kém mô hình trả lời đồng xu ngẫu nhiên quá hệ số 10.
- Tối đa 48 lượt âm mỗi điểm. Nếu chưa đủ bằng chứng, kết quả là `inconclusive`, không phải một ngưỡng.
- Kết quả ngoài dải cần posterior tail ≥0,90, ít nhất bốn phản hồi trực tiếp ở biên, tỷ lệ nhất quán ≥80% và ba phản hồi biên cuối cùng nhất quán.

Lượt im lặng không được đưa vào posterior như một mức âm. Nó được lưu riêng để phát hiện dương tính giả. Đo lại 1.000 Hz dùng một prior mới độc lập để kiểm tra tính lặp lại.

## Tính toàn vẹn của phiên đo

Mỗi lượt lưu snapshot gồm tai, tần số, lần đo, mức thực sự lên lịch, cách chọn mức, thời điểm bắt đầu/kết thúc và độ trễ trả lời. Một mã phát tăng dần cùng generation của audio context ngăn callback cũ mở nút trả lời hoặc sửa một phiên mới sau khi âm đã bị dừng.

Trước khi phát, mức phải hữu hạn và nằm trong `pointPlan` hiện hành. Bản ghi dùng đúng snapshot vừa phát, không đọc lại mức toàn cục sau đó. Rời trang dừng cả âm thử tai, âm kiểm tra, câu nói và âm hiệu chuẩn.

Phiên và từng kết quả lưu:

- phiên bản engine, chính sách dừng, lựa chọn mức và expected information;
- khoảng hậu nghiệm 95%, median/mean/MAP, entropy và xác suất ngoài dải;
- nuisance posterior, bằng chứng bracket, kiểm tra biên và log evidence;
- Bayes factor so với phản hồi 50/50, lý do dừng và thông tin hiệu chuẩn.

Khi đang đo, localStorage chỉ lưu `activeEstimate` để kiểm tra/audit. Trạng thái posterior đầy đủ không được khôi phục sau khi tải lại trang; phiên đang dở được đánh dấu gián đoạn để tránh tiếp tục từ một posterior không còn trong bộ nhớ.

## Quan hệ với phân mức WHO

Mọi dấu vết Bayesian trong metadata phiên hoặc kết quả đều khiến `whoReport()` chặn phân mức. Việc xóa một cờ giao diện không đủ vượt chặn. Đây là quyết định thận trọng cho đến khi engine được kiểm định lâm sàng; bảng WHO mô tả phân mức từ ngưỡng dB HL, không xác thực thuật toán Bayesian này.

Chế độ tăng 5/giảm 10 dB vẫn có trong giao diện để đối chiếu. Nó tiếp tục dùng gate WHO đã có khi đủ hiệu chuẩn và chất lượng.

## Kiểm thử và mô phỏng cố định

Chạy:

```powershell
node verify.cjs
node verify-bayesian.cjs
node verify-bayesian.cjs --benchmark
```

`verify-bayesian.cjs` kiểm tra bất biến mức phát, biên thập phân từ hiệu chuẩn, kết quả ngoài dải, dữ liệu hỏng, cập nhật hai lần, replay xác định và các ngưỡng hồi quy của mô phỏng seeded.

Benchmark mặc định dùng 48 phiên cho mỗi kịch bản. Ở seed hiện tại:

- logistic khớp lưới: Bayesian 47/48 phiên có estimate, MAE 1,78 dB trên các estimate và coverage khoảng 95% là 95,8%; trung bình 17,3 phản hồi. Staircase có MAE 3,99 dB và trung bình 10,8 phản hồi;
- hàm dốc nông ngoài lưới: coverage giảm còn 75%, thể hiện khoảng hậu nghiệm không bền khi mô hình sai;
- dải ngưỡng rộng: Bayesian không ép bất kỳ ngưỡng thật ngoài dải nào thành estimate trong mẫu seeded, nhưng 5/21 trường hợp ngoài dải kết thúc chưa xác định;
- phản hồi 50/50 không có ngưỡng thật vẫn tạo estimate ở 23/48 phiên. Vì vậy posterior hẹp và Bayes factor không đủ để xác nhận người dùng đáng tin; toàn phiên còn cần lượt im lặng và đo lại 1.000 Hz.

Các con số trên chỉ là kiểm thử số học với dữ liệu giả lập, không phải độ chính xác lâm sàng, độ nhạy, độ đặc hiệu hoặc cam kết hiệu năng trên người.

## Việc bắt buộc trước khi dùng ngoài nghiên cứu

1. Chốt protocol và preregister tiêu chí: sai số so với audiometer, độ lặp lại, coverage, tỷ lệ inconclusive, thời gian và quyết định chuyển khám.
2. Kiểm định điện–âm toàn chuỗi thiết bị; kiểm tra tuyến tính, méo, tần số, rò kênh, vị trí tai nghe và nhiễu nền.
3. Thử nghiệm pilot có giám sát, rồi nghiên cứu so sánh mù với pure-tone audiometry chuẩn trên nhóm đủ rộng về tuổi và mức nghe.
4. Tái ước lượng prior, độ dốc/lapse và điều kiện dừng bằng tập huấn luyện tách biệt; xác nhận lại trên tập độc lập. Không huấn luyện và báo kết quả trên cùng dữ liệu.
5. Chỉ sau khi per-frequency engine đạt tiêu chí mới xem xét Gaussian Process/Active Learning chọn cả tần số. Suy luận chéo tần số có thể nhanh hơn nhưng cũng có thể che khuất notch hoặc hình dạng hiếm nếu prior sai.
