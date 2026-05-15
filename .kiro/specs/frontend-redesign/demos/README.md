# Frontend Redesign — Style Demos

3 style options + 1 admin layout. Self-contained HTML files. Mở bằng browser:

```
1-linear-notion.html      → Linear/Notion clean (đề xuất student)
2-vercel-geist.html       → Vercel/Geist (sharp B&W)
3-apple-hig.html          → Apple HIG (soft glass)
4-admin-bento.html        → Admin dashboard (Bento grid layout)
```

## Cách so sánh

Mở từng file, focus vào:
1. **Header** — logo + nav style
2. **Code input** — chức năng chính của student home (nhập mã)
3. **Exam cards** — cách hiển thị danh sách đề
4. **Modal preview** — click "Bắt đầu" để xem popup style
5. **Dark mode** — toggle góc phải, xem có flicker không
6. **Mobile** — resize browser xuống 375px

## Mock data

Tất cả demo dùng cùng 1 mock content (3 đề tiếng Anh/Toán/IELTS) để fair compare.
Tên sản phẩm placeholder: **Drill** (đổi sau).

## Sau khi review

Quay lại chat, ghi: "Demo X (style) + tweak này này", tôi sẽ:
1. Lock style direction vào `requirements.md`
2. Tạo `design.md` với tokens + component library cho style đã chọn
3. Tạo `tasks.md` để implement
