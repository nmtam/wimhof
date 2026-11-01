# wimhof

Web app hỗ trợ tập thở theo phương pháp Wim Hof. Dùng cá nhân (một người dùng), chưa cần tài khoản hay máy chủ nhiều người.

## Trạng thái

Đã có sản phẩm chạy được: một file `tho-wim-hof.html`. Chưa có bước build, không có framework, không có package.json. Có test tự động cho `buildPlan` (chỉ phủ logic dựng lịch buổi tập, không phủ giao diện hay âm thanh).

## Cấu trúc

- `tho-wim-hof.html` (~1,9 MB, 851 dòng): HTML + CSS + JavaScript thuần trong một file. Mở thẳng bằng trình duyệt là chạy, không cần máy chủ.
- `resources/`: 36 file mp3 gốc (18 câu x tiếng Việt `-vi` / tiếng Anh `-en`). **App không đọc thư mục này lúc chạy**: toàn bộ mp3 đã nhúng vào HTML dạng base64. `resources/` chỉ là bản gốc để nhúng lại hoặc thay giọng.
- `tests/`: `load-plan.mjs` cắt đoạn code `buildPlan` thật từ HTML rồi chạy trong `vm` (không sao chép code); `build-plan.test.mjs` là các ca test.
- Phụ thuộc mạng duy nhất: font Be Vietnam Pro và Lexend từ Google Fonts. Mất mạng thì tự dùng font hệ thống, app vẫn chạy.

## Cách app hoạt động

- Ba tab: **Hướng dẫn** (slide giới thiệu), **Tập luyện** (quả cầu thở + cột thiết lập) và **Lịch sử** (số buổi, tổng phút, ngày liên tiếp, danh sách buổi, xoá từng buổi hoặc toàn bộ).
- Chữ hiển thị nằm trong `T` (nhãn giao diện), `SLIDES` (nội dung slide), `CLOSING` (lời kết); mỗi mục có đủ `vi` và `en`. Sửa chữ phải sửa cả hai ngôn ngữ.
- Buổi tập do `buildPlan` dựng thành dòng thời gian; đồng hồ chạy theo `AudioContext`. Mặc định 30 hơi x 3 vòng, nín thở vòng 1 là 30 giây, mỗi vòng sau tăng 30 giây. Giới hạn: 20-60 hơi, 1-10 vòng, nín 15-180 giây, tăng 0-60 giây. Lượt phục hồi cố định 15 giây.
- Âm thanh: giọng đọc từ mp3 nhúng (`VOICE_FILES`); nếu thiếu thì dùng giọng đọc của trình duyệt (`speechSynthesis`). Tiếng thở, chuông, nhạc nền do code tự tạo bằng Web Audio.
- **Hẹn trước âm thanh:** bấm Bắt đầu là `scheduleAll` hẹn tiếng thở, chuông, lời mp3 theo đồng hồ `AudioContext` (tối đa `AHEAD` = 15 phút trước, buổi dài hơn `tick` nạp dần), nên trang ở nền / tắt màn hình vẫn đúng giờ. `tick` (50 ms) chỉ lo chữ, giọng dự phòng `speechSynthesis` và đoạn kết. Tạm dừng = `AC.suspend()`, không tính lại `R.t0`. Dừng = hạ âm lượng nhánh `R.out` rồi stop mọi node trong `R.nodes`. Đổi cờ giữa buổi: `relangVoices` hẹn lại giọng. Hệ thống tự ngắt âm thanh (cuộc gọi, Siri) thì `AC.onstatechange` chuyển sang Tạm dừng.
- **Hai đồng hồ:** `clock()` dùng để hẹn âm thanh; `vclock()` = `clock()` trừ `AC.outputLatency` (tai nghe Bluetooth), dùng cho hình, chữ, `phaseAt` khi vẽ, để hình khớp với tiếng nghe thấy. Thêm chỗ vẽ mới thì dùng `vclock`.
- **Tần số vẽ:** `loop` vẽ mỗi khung hình ở pha thở và thả lỏng, ~10 lần/giây ở pha khác, ngừng khi tạm dừng (`loopTok` chống chạy chồng). `.orb` có `will-change: transform`.
- **Giải mã sớm:** lúc trang rảnh tạo `AudioContext` (để ở trạng thái nghỉ) và `loadVoices(lang)` giải mã 18 mp3 của ngôn ngữ đang chọn (`DECODED_BY`); đổi cờ thì giải mã ngôn ngữ kia. Tạo sớm lỗi thì tới lúc bấm Bắt đầu mới tạo. Không tập thì `AudioContext` nghỉ.
- Giữ màn hình sáng khi tập bằng Wake Lock (nếu trình duyệt hỗ trợ).
- Dữ liệu lưu trong `localStorage`, khoá: `whm.settings`, `whm.lang`, `whm.tab`, `whm.sound`, `whm.ack` (đã đọc cảnh báo an toàn), `whm.history` (`{v:1,items:[...]}`, tối đa 500 buổi, mới nhất ở cuối). Không có máy chủ.
- **Lịch sử:** khối `/* ---------- lịch sử ---------- */` (`histLoad/histAdd/histSave/histStats`). `stopSession` ghi một bản ghi khi đã qua ít nhất một lượt nín trọn vẹn (`roundsDone ≥ 1`); dừng sớm hơn hoặc đóng trang giữa buổi thì không ghi. Cài đặt lấy từ `R.cfg` (chụp lúc bấm Bắt đầu), `secs` theo `clock()` nên bỏ qua lúc tạm dừng. Ngày tính theo giờ máy. Chưa ghi thời gian nín thật (lượt nín là đếm ngược cố định).
- Có chế độ sáng/tối theo hệ thống.

## Bẫy khi sửa file HTML

- **Không đọc cả file bằng công cụ Read.** Các dòng mp3 (582-611) dài tới 480.000 ký tự. Dùng `grep -n ... | cut -c1-200` hoặc đọc theo khoảng dòng có cắt độ dài.
- Dòng 1-53 là hướng dẫn thay giọng tiếng Anh (bảng 18 file, thời lượng tối đa mỗi file, cách làm). **Khi thay giọng, làm theo hướng dẫn đó**: kiểm tên file, thời lượng, cắt khoảng lặng, cân âm lượng, nhúng lại, chạy thử. Thay `ket-thuc-en` thì phải sửa cả `CLOSING` và `CLOSING_AT`.
- Mỗi mp3 nằm trên một dòng dạng `/*EN:ten*/ "ten":"data:audio/mpeg;base64,...",`. Giữ nguyên dấu ngoặc kép, dấu phẩy và chú thích.
- Sửa xong phải mở trình duyệt chạy thử một buổi ngắn ở cả hai ngôn ngữ (20 hơi, 2 vòng, nín 15 giây).
- Sao lưu hoặc dùng git trước khi sửa vì file lớn, khó xem diff.
- **Hai chú thích mốc quanh `buildPlan`** (`/* ---------- lịch buổi tập ---------- */` và `/* ---------- âm thanh ---------- */`) cùng dòng `const TEMPO=...` được test dùng để cắt code; đổi chữ mốc phải sửa `tests/load-plan.mjs`.

## Công nghệ

Hiện: HTML/CSS/JS thuần, một file. Chuyển sang framework hay tách file hay không: **chưa chốt**, hỏi anh Tâm trước khi đổi.

## Lệnh thường dùng

- Chạy thử: mở `tho-wim-hof.html` bằng trình duyệt.
- Chạy test (cần Node ≥ 20, không cần cài gì): `node --test --test-concurrency=1 tests/*.test.mjs`. Chưa có lệnh build.

## Ngôn ngữ

- Giao diện app: đa ngôn ngữ, **Việt + Anh**. Mọi chữ hiển thị cho người dùng phải đi qua cơ chế dịch, không ghi cứng trong giao diện.
- Code, tên biến, tên file, commit: tiếng Anh.
- Trao đổi với anh Tâm: tiếng Việt, lời thường, ít thuật ngữ.

## Test

- Tối đa 4 luồng song song.
- Chỉ chạy test liên quan phần đang sửa; chạy toàn bộ khi anh Tâm yêu cầu rõ (vẫn tối đa 4 luồng).
- Truyền quy tắc này cho mọi subagent chạy test.

## Git

- Chỉ làm git (add, commit, push, tạo nhánh, PR) khi anh Tâm yêu cầu rõ. Không tự đề nghị.
- Commit message: 1 dòng, kiểu conventional commit, không viết thân dài.
- Cần thao tác git để hoàn thành việc mà chưa được yêu cầu → hỏi trước.

## Cách làm việc

- Không rõ thì hỏi, không đoán. Có nhiều cách hiểu thì nêu giả định và hỏi lại.
- Luôn phản biện để giúp anh Tâm nghĩ sâu hơn: chỉ ra điểm yếu, rủi ro, phương án khác, rồi chờ anh chốt. Yêu cầu có vẻ không hợp lý thì nêu chỗ vướng và đề xuất cách khác.
- Báo cáo ngắn, kết luận trước: đã làm gì, kết quả, anh cần làm gì.

## Lưu ý về nội dung

App liên quan hơi thở và tiếp xúc lạnh. Không viết nội dung tuyên bố chữa bệnh. Có cảnh báo an toàn rõ ràng: không tập khi đang lái xe, trong nước hoặc nơi có thể ngất xỉu.
