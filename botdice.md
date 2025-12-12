📘 BotDice VIN – Luật Hoạt Động Chi Tiết

BotDice là bot tự động chơi Even/Odd Dice trên hợp đồng thông minh VIN Dice V2.
Bot hoạt động theo nhiều chu kỳ (cycles) trong một ca làm việc (session) và mục tiêu là tăng dần số VIN an toàn, đồng thời tự động dừng khi đạt lợi nhuận mong muốn.

🧠 1. Triết Lý Hoạt Động

Bot tuân theo quy tắc đơn giản nhưng cực kỳ hiệu quả:

“Ra cái gì đánh cái đó.”

Nếu ván trước ra chẵn, ván sau đánh chẵn

Nếu ván trước ra lẻ, ván sau đánh lẻ

Chỉ ván đầu tiên của mỗi chu kỳ là chọn ngẫu nhiên (Even hoặc Odd)

Bot sử dụng chuỗi cược cố định:
1 → 2 → 4 (sau đó giữ 4 nếu thua liên tục)
… và reset về 1 mỗi khi thắng.

🔄 2. Cấu Trúc Chạy Của Bot

Bot vận hành theo 3 lớp thời gian:

(A) Ván (Round)

Một lần đặt cược trên smart contract.
Bot ghi nhận:

Số dư trước cược

Số tiền cược

Kết quả

Lãi/Lỗ

Cập nhật kết quả để đánh ván kế tiếp

(B) Chu Kỳ (Cycle)

Một chu kỳ gồm nhiều ván, mục tiêu:

👉 Mục tiêu chu kỳ = Đỉnh VIN trước đó + CYCLE_TARGET_DELTA

(Mặc định: +1 VIN)

Chu kỳ kết thúc khi:

Đạt mục tiêu đỉnh mới, hoặc

Hết chuỗi cược, hoặc

Gặp lỗi TX/gas, hoặc

Số dư không đủ để cược tiếp

Khi chu kỳ kết thúc bot in:

Tổng số ván

Số thắng / thua

Lợi nhuận chu kỳ

Số dư VIN sau chu kỳ

Kết quả cuối chu kỳ (để đánh ván 2 trở đi của chu kỳ kế tiếp)

(C) Ca Làm Việc (Session)

Một session = nhiều chu kỳ liên tục.

Bot theo dõi lợi nhuận tổng của toàn session:

👉 Nếu tổng lợi nhuận trong ca ≥ WITHDRAW_THRESHOLD_VIN

(mặc định: 100 VIN)

→ Bot dừng hẳn để bạn rút 100 VIN vào Quỹ Rủi Ro.

(Lợi nhuận session không reset trong suốt ca, nhưng reset khi bạn tự restart.)

🔢 3. Logic Cược Chi Tiết
3.1. Cách chọn cửa
Trường hợp	Bot chọn cửa
Ván đầu chu kỳ	RANDOM (Even hoặc Odd)
Ván từ thứ 2 trở đi	Cửa = kết quả ván trước
3.2. Chuỗi cược
1 VIN → 2 VIN → 4 VIN → 4 VIN → 4 VIN → ...

Quy tắc:

Nếu thắng → reset về 1

Nếu thua → tăng lên bước tiếp theo

Nếu vượt quá 4 → luôn giữ 4

3.3. Kiểm tra bank của dice

Bot chỉ đặt cược khi:

DiceBank ≥ 2 × stake


Nếu Bank nhỏ hơn → bot tạm ngưng chu kỳ để an toàn.

💰 4. Quản Lý Lợi Nhuận

Bot chia làm 2 cấp:

4.1. Lợi nhuận chu kỳ (cycle profit)

Dùng để xác định có tăng đỉnh VIN hay không.

4.2. Lợi nhuận toàn ca (session accumulated profit)

sessionAccumProfit += profit mỗi chu kỳ

Khi đạt:

sessionAccumProfit ≥ WITHDRAW_THRESHOLD_VIN


Bot thực hiện:

In cảnh báo nổi bật

Yêu cầu bạn rút 100 VIN vào Quỹ Rủi Ro

Dừng bot (process.exit)

🛑 5. Các Điều Kiện Làm Bot Dừng

Bot chỉ dừng trong 3 trường hợp:

Session profit đạt ngưỡng rút
→ Bạn rút 100 VIN, bảo toàn lợi nhuận.

Lỗi TX liên tục hoặc RPC lỗi nặng
→ Bot tự dừng để bảo vệ vốn.

Bạn bấm Ctrl+C / kill bot

⚙️ 6. File .env – Cấu Hình Chính
RPC_URL=https://rpc.monad.xyz
PRIVATE_KEY=0x...
VIN_TOKEN_ADDRESS=0x...
DICE_CONTRACT_ADDRESS=0x...

MIN_DEPOSIT_VIN=1000          # cảnh báo, không còn bắt buộc
WITHDRAW_THRESHOLD_VIN=100    # bot dừng khi lợi nhuận CA >= 100 VIN
MIN_STAKE_VIN=1
MAX_STAKE_VIN=8
CYCLE_TARGET_DELTA=1
POLL_INTERVAL_SEC=6

GAS_PRICE_MAX_GWEI=250
GAS_WAIT_MAX_MS=120000
GAS_CHECK_INTERVAL_MS=5000
CONFIRMATIONS=1

APPROVE_ALLOWANCE_VIN=1000000
BET_RETRY_ATTEMPTS=3
BET_RETRY_BASE_MS=1500

LOG_FILE=./bot.log

📝 7. State File bot_state.json

Bot tự tạo file này để nhớ:

vin_peak – đỉnh VIN cao nhất từng đạt

cycle_count – số chu kỳ đã chạy

cumulative_profit – tổng lãi toàn lịch sử bot

total_rounds – số lượng ván đã chơi

last_cycle_final_result – để đánh các ván kế tiếp

Bạn không cần chỉnh sửa file này.

🚀 8. Khởi Chạy Bot
pm2 start botdice.js --name botdice
pm2 logs botdice

🧹 9. Reset Ca (session)

Khi bạn rút 100 VIN và muốn khởi động lại ca mới:

pm2 restart botdice


Bot sẽ:

Giữ lại vin_peak

Reset sessionAccumProfit

Bắt đầu ca mới

🙋 10. Khi cần chỉnh sửa bot

Bạn chỉ cần gửi lại 3 file:

1️⃣ botdice.js
2️⃣ .env
3️⃣ botdice.md

Mình sẽ đọc đúng luật bạn đang dùng và chỉnh code chính xác theo tài liệu của bạn.
