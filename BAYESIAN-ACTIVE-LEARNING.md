# Bayesian/Active Learning — bản nghiên cứu v3

## Mục tiêu và phạm vi

Engine `bayesian-threshold-v3` ước lượng ngưỡng nghe riêng cho từng tai và từng tần số từ phản hồi nghe/không nghe. Sau mỗi phản hồi, nó chọn mức âm hợp lệ có lượng thông tin kỳ vọng lớn nhất về ngưỡng. “Tối ưu” ở đây chỉ có nghĩa là tối đa hóa tiêu chí thông tin trong mô hình đã khai báo; không có nghĩa là đã tối ưu hoặc xác thực trên người dùng thực.

Thiết kế dựa trên hướng nghiên cứu Bayesian active learning cho đo thính lực, trong đó ngưỡng được biểu diễn bằng phân phối xác suất, kích thích tiếp theo được chọn theo thông tin kỳ vọng và kết quả có khoảng bất định. Nguồn phương pháp chính:

- Schlittenlacher J, Turner RE, Moore BCJ. [Audiogram estimation using Bayesian active learning](https://doi.org/10.1121/1.5047436), *JASA* 2018 — audiogram estimation using Bayesian active learning.
- Cox M, de Vries B. [Bayesian Pure-Tone Audiometry Through Active Learning Under Informed Priors](https://doi.org/10.3389/fdgth.2021.723348), 2021.

Dự án này là một triển khai độc lập, đơn giản hơn các mô hình Gaussian Process trong nghiên cứu: chưa dùng prior học từ dữ liệu lâm sàng và chưa suy luận chéo giữa các tần số.

## Mô hình hiện tại

- Ngưỡng là mức mà xác suất trả lời “nghe thấy” bằng 50%.
- Prior ngưỡng là phân phối đều rời rạc, mở rộng 30 dB ra ngoài mỗi biên phát để mô hình có thể kết luận ngưỡng ngoài dải thay vì ép về biên.
- Hàm tâm lý là logistic. Engine lấy trung bình Bayes trên lưới độ dốc 1,5/3/6/10 dB (prior 0,15/0,35/0,30/0,20) và xác suất dương tính giả/lapse 0,01/0,05/0,15/0,30 (prior 0,35/0,35/0,20/0,10). Đây là prior thiết kế, chưa học từ người tham gia.
- Candidate phát nằm trên lưới 5 dB cùng hai biên hiệu chuẩn chính xác. Candidate không bao giờ vượt `min/max`, không tăng quá 10 dB so với lượt trước và không được tự làm tròn qua giới hạn SPL.
- Active Learning chọn candidate tối đa hóa mutual information giữa phản hồi kế tiếp và ngưỡng, sau khi lấy trung bình trên nuisance parameters. Nó không dùng riêng entropy của phản hồi. Sau mỗi bốn phản hồi âm, một lượt probe hướng về median ±15 dB (luân phiên hai phía) kiểm tra sự phụ thuộc vào mức âm. Probe dùng candidate gần mục tiêu nhất trong giới hạn mức phát và bước tăng 10 dB; vì vậy không phải lúc nào cũng đạt đủ ±15 dB. Probe là âm thật và được đưa vào posterior, khác lượt im lặng.
- Mỗi điểm cần ít nhất 12 lượt âm. Một ước lượng chỉ được chấp nhận khi khoảng hậu nghiệm equal-tail 95% rộng không quá 10 dB, nằm trọn trong dải phát, có ít nhất hai lần không nghe dưới ngưỡng giữa và hai lần nghe trên ngưỡng giữa, và bằng chứng của mô hình nghe phải lớn hơn ít nhất 20 lần cả hai mô hình đối chiếu: phản hồi độc lập 50/50 và phản hồi độc lập có xác suất nghe chưa biết với prior Beta(1,1). Ngưỡng evidence này không được cấu hình thấp hơn mặc định. Hệ số 20 không phải xác suất 95% người trả lời đáng tin.
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
- Bayes factor so với phản hồi 50/50 và Beta–Bernoulli, prior đối chiếu, ngưỡng evidence, lý do dừng và thông tin hiệu chuẩn. Kết quả v3 thiếu các bằng chứng này không đạt kiểm tra chất lượng nội bộ.

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
node verify-bayesian.cjs --validation
node verify-reliability.cjs
```

`verify-bayesian.cjs` kiểm tra bất biến mức phát, biên thập phân từ hiệu chuẩn, kết quả ngoài dải, dữ liệu hỏng, cập nhật hai lần, replay xác định và các ngưỡng hồi quy của mô phỏng seeded.

Benchmark mặc định dùng 48 lần chạy bộ ước lượng từng điểm/tần số cho mỗi kịch bản. Với cùng seed cũ, v3 giảm số `estimate` của phản hồi 50/50 từ 23/48 (v2) xuống 1/48. Coverage toàn bộ lượt có ngưỡng thật ở kịch bản slope 7 tăng từ 75% lên 89,58%; đây chưa phải bằng chứng coverage đạt 95%.

`bayesian-validation.json` dùng ba seed khác, cố định trước khi xem kết quả: 388606925, 2212895493, 4043887474; mỗi seed 64 lần/kịch bản, tổng 192. Không chỉnh lại engine theo kết quả bộ mở rộng này. Bảng dưới ghi riêng tỷ lệ cho ra estimate và coverage để tránh che giấu những ca chưa kết luận được:

| Kịch bản | Estimate / 192 | MAE chỉ trên estimate (dB) | Coverage toàn bộ / chỉ estimate | Phản hồi trung bình |
|---|---:|---:|---:|---:|
| matched_logistic | 180 | 1.6138 | 98.44% / 98.33% | 29.5625 |
| shallow_slope | 74 | 2.4076 | 93.75% / 89.19% | 42.1615 |
| random_responder | 1 | — | — / — | 45.625 |
| biased_yes | 0 | — | — / — | 20.4896 |
| biased_no | 0 | — | — / — | 21.0052 |
| very_shallow | 18 | 4.4438 | 86.46% / 66.67% | 46.2865 |

Đánh đổi: nhiều lượt âm hơn, và nhiều kết quả `inconclusive` hơn. Kết quả trả lời lệch 80%/20% thường là **ngoài dải**, không phải đã chứng minh người dùng đáng tin; mọi điểm ngoài dải đều không đạt điều kiện phân mức. Người luôn bấm một đáp án không có ngưỡng thật để tính sai số.

Giới hạn còn lại: slope 14 ngoài lưới vẫn có coverage thấp, đặc biệt trên các estimate được chấp nhận. Mô hình ngưỡng cố định cũng không xử lý đầy đủ thay đổi ngưỡng do mệt mỏi; kịch bản `threshold_drift` không báo MAE/coverage vì không có một ngưỡng thật cố định. Probe, Bayes factor, catch và retest không bảo đảm phát hiện mọi phản hồi sai.

JSON chứa cả khoảng Wilson 95% cho tỷ lệ estimate và coverage; những khoảng này mô tả sự bất định của tỷ lệ trong mô phỏng, khác khoảng hậu nghiệm ngưỡng. Đây đều là dữ liệu giả lập, không phải độ chính xác lâm sàng, độ nhạy, độ đặc hiệu hoặc cam kết hiệu năng trên người. Số lượt chưa tính lượt im lặng và thời gian người dùng thao tác.

## Lưu trữ và xử lý gián đoạn v3

- `session-store.js` kiểm tra phiên bản, kiểu dữ liệu, đơn vị, điểm đo, phản hồi, khoảng bất định và mã phiên trước khi dữ liệu được hiển thị hoặc ghi lại. Giữ schema 1 để đọc lịch sử cũ đúng cấu trúc; không tự chuyển phiên bản engine cũ thành v3.
- Dữ liệu hỏng hoặc phiên bản chưa hỗ trợ: giữ nguyên chuỗi JSON gốc, hiện các phiên hợp lệ và khóa ghi lịch sử. Phiên mới vẫn ở bộ nhớ; phải xuất JSON. Không tự xóa hoặc ghi đè phần lỗi.
- Lỗi quota/quyền lưu không xóa dữ liệu trước đó. Phát hiện lịch sử thay đổi từ tab khác trước khi ghi; giữ dữ liệu mới của tab kia. Đây là kiểm tra xung đột, không phải cơ sở dữ liệu giao dịch đa tab; nên chỉ đo trong một tab.
- Tab Lịch sử có xuất toàn bộ phiên, tải dữ liệu gốc và nhập một phiên/danh sách từ JSON. File tối đa 10 MB, tối đa 1.000 phiên; trùng mã nhưng khác dữ liệu đo bị từ chối. Import không ghi đè và không phát âm thanh. Hồ sơ hiệu chuẩn dùng tab nhập riêng.
- Khôi phục để xem lại dữ liệu, **chưa tự tiếp tục posterior sau tải lại trang**. Phiên dở đánh dấu gián đoạn; cần bắt đầu bài mới sau khi kiểm tra lại điều kiện. Không tự bổ sung các xác nhận còn thiếu.
- Khi rời trang trong lúc đọc/giải mã file lời nói, công việc cũ bị vô hiệu hóa và không được tạo phiên hoặc sửa buffers của công việc mới. Kiểm thử điều khiển promise kiểm tra cả hủy trước/sau đọc file và trong decode, cùng callback âm đơn đến muộn.

## Việc bắt buộc trước khi dùng ngoài nghiên cứu

1. Chốt protocol và preregister tiêu chí: sai số so với audiometer, độ lặp lại, coverage, tỷ lệ inconclusive, thời gian và quyết định chuyển khám.
2. Kiểm định điện–âm toàn chuỗi thiết bị; kiểm tra tuyến tính, méo, tần số, rò kênh, vị trí tai nghe và nhiễu nền.
3. Thử nghiệm pilot có giám sát, rồi nghiên cứu so sánh mù với pure-tone audiometry chuẩn trên nhóm đủ rộng về tuổi và mức nghe.
4. Tái ước lượng prior, độ dốc/lapse và điều kiện dừng bằng tập huấn luyện tách biệt; xác nhận lại trên tập độc lập. Không huấn luyện và báo kết quả trên cùng dữ liệu.
5. Chỉ sau khi per-frequency engine đạt tiêu chí mới xem xét Gaussian Process/Active Learning chọn cả tần số. Suy luận chéo tần số có thể nhanh hơn nhưng cũng có thể che khuất notch hoặc hình dạng hiếm nếu prior sai.
