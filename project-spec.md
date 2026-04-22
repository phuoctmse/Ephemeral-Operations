# AI FINOPS SANDBOX (EPH-OPS) - TÀI LIỆU ĐẶC TẢ HỆ THỐNG

## 1. Tổng quan dự án (Project Overview)
EphOps là một hệ thống **Agentic FinOps** được thiết kế để cấp phát, quản lý và hủy tự động các môi trường kiểm thử tạm thời (ephemeral environments). AI Agent sẽ phân tích các yêu cầu bằng ngôn ngữ tự nhiên, chuyển đổi chúng thành mã nguồn hạ tầng, ước tính chi phí và thực thi quy trình dọn dẹp tự động để triệt tiêu lãng phí tài nguyên đám mây.

## 2. Chiến lược môi trường (Zero-Risk FinOps)
Hệ thống bắt buộc phải tách biệt môi trường để bảo vệ hạn mức ngân sách $200 AWS. AI IDE phải tuân thủ các ranh giới này khi tạo mã nguồn:

### 2.1. Phát triển tại cục bộ (`NODE_ENV=local`)
- **LLM Provider:** Local Ollama API (`http://localhost:11434`).
- **Giả lập Cloud:** Floci (`http://localhost:4566`).
- **Chi phí:** $0 (Chạy hoàn toàn trên máy cá nhân).

### 2.2. Môi trường thực tế (`NODE_ENV=production`)
- **LLM Provider:** Gemini API (Gói miễn phí/Free Tier).
- **Cloud Provider:** AWS Cloud thật.
- **Ngân sách:** Giới hạn cứng (Hard cap) $200/tháng.

---

## 3. Danh mục công nghệ cốt lõi (Core Tech Stack)
- **Backend:** Node.js, TypeScript, NestJS (Kiến trúc doanh nghiệp tiêu chuẩn).
- **Cơ sở dữ liệu:** PostgreSQL quản lý bởi Prisma ORM.
- **Tự động hóa Cloud:** AWS SDK for JavaScript v3 (`@aws-sdk/client-ec2`).
- **Xác thực dữ liệu:** Zod (Dùng để parse JSON từ LLM một cách nghiêm ngặt).
- **Lập lịch tác vụ:** `node-cron` (Dùng để chạy ngầm tiến trình dọn dẹp TTL).

## 4. Database Schema Design (Prisma)

Hệ thống sử dụng PostgreSQL để lưu vết toàn bộ hoạt động của AI Agent và trạng thái hạ tầng. AI IDE cần tuân thủ schema dưới đây khi thực hiện các câu lệnh truy vấn dữ liệu.

### 4.1. Enums & Trạng thái (Lifecycle States)
- `EnvStatus`: 
    - `CREATING`: Đang trong quá trình gọi AWS SDK để khởi tạo.
    - `RUNNING`: Tài nguyên đã sẵn sàng và đang hoạt động.
    - `DESTROYED`: Đã được dọn dẹp sạch sẽ để tránh tốn tiền.
    - `FAILED`: Gặp lỗi trong quá trình tạo hoặc dọn dẹp.

### 4.2. Model: `SandboxEnv` (Quản lý thực thể hạ tầng)
Đây là bảng chính điều phối vòng đời của một môi trường tạm thời.
- `id`: UUID (Primary Key).
- `prompt`: Nội dung yêu cầu gốc của người dùng (dùng để Audit).
- `resourceId`: ID thực tế của Instance trên AWS (ví dụ: `i-0abc123...`).
- `instanceType`: Loại cấu hình (Ví dụ: `t3.micro`).
- `status`: Giá trị thuộc `EnvStatus`.
- `hourlyCost`: Chi phí ước tính mỗi giờ (Float).
- `costIncurred`: Tổng chi phí thực tế đã tiêu tốn cho phiên làm việc này.
- `createdAt`: Thời điểm khởi tạo.
- `expiresAt`: Thời điểm "tử hình" (Deadline cho cleanup job).

### 4.3. Model: `ActionLog` (Lưu vết tư duy AI)
Dùng để lưu lại các bước suy luận của AI Agent trước khi đưa ra quyết định hành động.
- `id`: UUID (Primary Key).
- `envId`: Foreign Key liên kết với `SandboxEnv`.
- `agentReasoning`: Chuỗi văn bản/JSON chứa phân tích của AI về kịch bản test.
- `toolCalled`: Tên hàm/công cụ mà AI đã yêu cầu Backend thực thi (ví dụ: `provision_ec2`).
- `output`: Kết quả trả về từ hệ thống sau khi thực thi lệnh.
- `timestamp`: Thời điểm ghi log.

### 4.4. Prisma Schema Snippet (Reference)
```prisma
enum EnvStatus {
  CREATING
  RUNNING
  DESTROYED
  FAILED
}

model SandboxEnv {
  id           String      @id @default(uuid())
  prompt       String
  resourceId   String?     @unique
  instanceType String
  status       EnvStatus   @default(CREATING)
  hourlyCost   Float       @default(0.0)
  costIncurred Float       @default(0.0)
  createdAt    DateTime    @default(now())
  expiresAt    DateTime
  logs         ActionLog[]
}

model ActionLog {
  id             String     @id @default(uuid())
  envId          String
  sandboxEnv     SandboxEnv @relation(fields: [envId], references: [id])
  agentReasoning String     @db.Text
  toolCalled     String
  output         String     @db.Text
  timestamp      DateTime   @default(now())
}
```

## 5. LLMOps & Guardrails (AI Agent Behavior)

Phần này quy định cách Backend giao tiếp với LLM (Ollama hoặc Gemini) và các ràng buộc để đảm bảo AI hoạt động như một chuyên gia FinOps thực thụ.

### 5.1. System Prompt Strategy
AI Agent phải được khởi tạo với một System Prompt nghiêm ngặt:
- **Identity:** "Bạn là một Chuyên gia FinOps Infrastructure Agent."
- **Mission:** "Nhiệm vụ của bạn là phân tích yêu cầu kiểm thử và cấp phát hạ tầng với chi phí thấp nhất có thể."
- **Constraint:** "Tuyệt đối không được cấp phát các tài nguyên nằm ngoài danh mục miễn phí hoặc giá rẻ (t3.micro). Nếu yêu cầu vượt quá khả năng, bạn phải từ chối và giải thích lý do."

### 5.2. Tool Use (Function Calling)
AI Agent phải sử dụng các "Công cụ" sau để tương tác với hệ thống:
1. `get_pricing_estimate`: Tra cứu chi phí ước tính cho loại instance.
2. `provision_resources`: Yêu cầu Backend gọi AWS SDK để tạo server.
3. `log_reasoning`: Lưu lại phân tích logic vào Database trước khi hành động.

### 5.3. Structured Output & Validation (Zod)
Mọi phản hồi từ LLM phải là **JSON nguyên bản**. Backend phải sử dụng **Zod** để ép kiểu dữ liệu trước khi xử lý logic.

**Zod Schema Code Reference:**
```typescript
import { z } from 'zod';

export const AgentDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  reasoning: z.string().describe("Giải thích tại sao chọn cấu hình này"),
  config: z.object({
    instanceType: z.enum(["t3.micro", "t4g.nano"]),
    ttlHours: z.number().min(0.5).max(2),
    region: z.string().default("us-east-1")
  }).optional(),
  costAnalysis: z.object({
    estimatedHourly: z.number(),
    totalExpected: z.number()
  })
});

## 6. Cloud Security & FinOps Limits (The Budget Shield)

Phần này định nghĩa các chốt chặn kỹ thuật bắt buộc phải có trong code Backend. Các quy tắc này không phụ thuộc vào quyết định của AI; chúng là các điều kiện tiên quyết (Pre-conditions).

### 6.1. Backend Hard-coded Guardrails
Trước khi gọi bất kỳ hàm nào từ `@aws-sdk/client-ec2`, Backend phải kiểm tra các điều kiện sau:

1.  **Concurrency Limit (Giới hạn song song):**
    * Chỉ cho phép tối đa **02** môi trường ở trạng thái `RUNNING` cùng một lúc.
    * Nếu vượt quá, hệ thống phải chặn yêu cầu tạo mới và yêu cầu người dùng tắt môi trường cũ.

2.  **Strict Instance Whitelist:**
    * Chỉ chấp nhận các loại Instance: `['t3.micro', 't4g.nano']`.
    * Bất kỳ yêu cầu nào cho các dòng máy khác đều bị ném lỗi `UnauthorizedInstanceTypeError`.

3.  **Maximum TTL (Time-To-Live):**
    * Thời gian sống của một môi trường không bao giờ được vượt quá **2 giờ**.
    * Nếu LLM đề xuất TTL lâu hơn, Backend tự động ghi đè (override) về giá trị 2 giờ.

### 6.2. IAM Policy & Security Principle
Ứng dụng phải tuân thủ nguyên tắc "Quyền hạn tối thiểu" (Least Privilege).

- **IAM Role cho App:** Không sử dụng quyền `AdministratorAccess`. 
- **Quyền hạn bắt buộc:**
    - `ec2:RunInstances`: Chỉ được phép nếu có kèm `Condition` về loại máy (`instanceType`).
    - `ec2:TerminateInstances`: Chỉ được phép xóa các tài nguyên có tag `Project: EphOps`.
    - `ec2:CreateTags`: Để đánh dấu tài nguyên phục vụ việc quản lý chi phí.

### 6.3. Automated Cleanup (Kill-switch)
Hệ thống phải triển khai một worker ngầm (background worker) để dọn dẹp rác:

- **Công cụ:** `node-cron`.
- **Tần suất:** Mỗi 5 phút/lần.
- **Logic:**
    1. Quét bảng `SandboxEnv` tìm các bản ghi có `expiresAt < Now()` và status là `RUNNING`.
    2. Gọi `TerminateInstances` cho các `resourceId` tương ứng.
    3. Cập nhật status thành `DESTROYED` và tính toán tổng `costIncurred`.

### 6.4. AWS Budgets Integration (Phòng thủ tầng Cloud)
Thiết lập cảnh báo trực tiếp trên tài khoản AWS (ngoài phạm vi code):
- Ngưỡng cảnh báo: 5 USD.
- Hành động: Gửi thông báo về Email/Slack ngay lập tức khi chi phí dự kiến chạm ngưỡng.

## 7. Strict Coding Rules & Engineering Standards

Phần này quy định các tiêu chuẩn bắt buộc khi viết code. AI IDE phải tuân thủ nghiêm ngặt các quy tắc này để đảm bảo tính ổn định và khả năng mở rộng của hệ thống.

### 7.1. Language & Framework Standards
- **TypeScript:** Bắt buộc sử dụng TypeScript với cấu hình `strict: true`. Không được phép sử dụng kiểu `any`. 
- **NestJS Architecture:** - Chia rõ ràng các lớp: `Controller` (nhận request), `Service` (xử lý logic), `Repository` (truy vấn DB qua Prisma).
    - Sử dụng Dependency Injection (DI) để quản lý các service.
- **Environment Variables:** Sử dụng thư viện `@nestjs/config` để quản lý biến môi trường. Tuyệt đối không hardcode API Key hay URL của Floci/Ollama.

### 7.2. Error Handling & Resilience
- **Global Exception Filter:** Mọi lỗi phải được bắt và trả về định dạng JSON thống nhất cho Client.
- **Rollback Logic:** Trong các hàm Provisioning, nếu gọi AWS SDK thất bại ở bất kỳ bước nào, hệ thống phải thực hiện "Rollback":
    - Xóa các tài nguyên đã tạo dở dang.
    - Cập nhật status `FAILED` trong Database kèm nguyên nhân lỗi chi tiết.
- **Graceful Shutdown:** Đảm bảo ứng dụng đóng các kết nối Database (Prisma) và Worker (Cron) trước khi dừng service.

### 7.3. API Design & Validation
- **RESTful API:** Sử dụng đúng các HTTP Verbs (`GET`, `POST`, `PATCH`, `DELETE`).
- **Input Validation:** Sử dụng `class-validator` phối hợp với `Zod` để đảm bảo dữ liệu đầu vào và dữ liệu từ LLM luôn sạch sẽ.
- **DTOs (Data Transfer Objects):** Mỗi API endpoint phải có DTO riêng cho Request và Response.

### 7.4. Testing Strategy (DevOps Focus)
AI IDE khi tạo code phải đi kèm với các kịch bản test:
- **Unit Testing:** Sử dụng `Jest`. Tập trung vào logic phân tích chi phí của Agent và các logic tính toán thời gian `expiresAt`.
- **Mocking:** - Mock hoàn toàn các gọi API đến LLM (Ollama/Gemini).
    - Mock AWS SDK bằng các thư viện như `aws-sdk-client-mock`.
- **Zero-Network Policy in Tests:** Các bộ test phải chạy được 100% offline, không được phụ thuộc vào việc Floci hay Ollama đang chạy.

### 7.5. Documentation & Logging
- **Swagger:** Tích hợp Swagger UI (`/api/docs`) để mô tả toàn bộ các endpoint của hệ thống.
- **Structured Logging:** Sử dụng `Pino` hoặc `Winston` để log lại các sự kiện quan trọng (AI Decision, AWS Action, Cron Job Trigger) dưới dạng JSON để dễ dàng truy vấn log sau này.