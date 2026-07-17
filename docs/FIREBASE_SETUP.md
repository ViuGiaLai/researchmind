# Firebase Authentication và Firestore

## Console Firebase

1. Tạo hoặc chọn project tại [Firebase Console](https://console.firebase.google.com/).
2. Vào **Authentication → Sign-in method** và bật **Google** cùng **Email/Password**. Với Google, chọn một email hỗ trợ và hoàn tất màn hình OAuth consent nếu Console yêu cầu.
   Trong **Authentication → Settings → Authorized domains**, giữ `fir-viu-chat-app.firebaseapp.com`, đồng thời thêm `localhost` và `127.0.0.1` để chạy Vite ở máy phát triển. Thêm domain web riêng trước khi phát hành bản web. Google yêu cầu domain redirect được cho phép khi dùng OAuth.
3. Vào **Project settings → Your apps**, tạo Web app rồi sao chép các giá trị cấu hình vào `apps/desktop/.env.production`:

```text
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=<project>.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=<project-id>
VITE_FIREBASE_APP_ID=...
```

Với Web app `my_web_researchMind`, cấu hình bạn đã cung cấp là nhất quán: `authDomain=fir-viu-chat-app.firebaseapp.com` và `projectId=firebase-viu-chat-app`. Hai giá trị không cần giống nhau vì Hosting site có thể có tên khác Project ID.

## Google OAuth cho desktop

Không dùng URL callback cố định trong code. Mỗi môi trường tự đặt biến tương ứng:

```text
# backend/.env khi phát triển local
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
DESKTOP_GOOGLE_CALLBACK_URL=http://127.0.0.1:8765/api/auth/desktop/google/callback

# Render production (hoặc để DESKTOP_GOOGLE_CALLBACK_URL trống và dùng PUBLIC_BACKEND_URL)
PUBLIC_BACKEND_URL=https://your-service.onrender.com
DESKTOP_GOOGLE_CALLBACK_URL=https://your-service.onrender.com/api/auth/desktop/google/callback
```

Đăng ký đúng URL của môi trường đang dùng trong Google Cloud OAuth Client. `GOOGLE_OAUTH_CLIENT_SECRET` chỉ nằm ở backend hoặc Render, không được đưa vào `VITE_*`, app desktop hay Git.

Các biến `VITE_FIREBASE_*` là định danh web công khai, không phải service-account secret.

4. Vào **Firestore Database**, tạo database ở Production mode. Dán nội dung từ `firestore.rules` vào tab **Rules** rồi Publish. Rules này từ chối client truy cập trực tiếp; chỉ Render backend đã xác thực mới ghi profile vào collection `users`.
5. Vào **Project settings → Service accounts**, tạo private key JSON. Không commit file này. Upload nó trên Render tại **Environment → Secret Files** với tên `firebase-service-account.json`.

## Render và desktop

- Đặt `FIREBASE_PROJECT_ID` trên Render và giữ `FIREBASE_AUTH_ENABLED=true`.
- Build desktop sau khi có `.env.production`. Không dùng `VITE_*` cho Gemini, Claude hay Firebase service-account key vì Vite đưa chúng vào app.
- Firebase ID token được gửi qua HTTPS trong header `Authorization`; Render backend xác minh token trước mọi API trừ ping/health.

## Dữ liệu lưu ở đâu

Firestore chỉ lưu profile tối thiểu: UID, email, display name, avatar, provider và lần đăng nhập gần nhất. PDF, vector, chat và nghiên cứu vẫn local theo kiến trúc hiện tại. Muốn nhiều người dùng đồng thời cần bước tiếp theo: tách toàn bộ dữ liệu nghiên cứu theo UID hoặc chuyển chúng sang storage/database có phân quyền.
