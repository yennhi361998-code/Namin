ObjC.import("CoreGraphics");
ObjC.import("CoreText");
ObjC.import("Foundation");

function hexToRGB(hex) {
    hex = hex.replace("#", "").trim();
    if (hex.length === 3) hex = hex.split("").map(function(c) { return c + c; }).join("");
    var r = parseInt(hex.substring(0, 2), 16) / 255;
    var g = parseInt(hex.substring(2, 4), 16) / 255;
    var b = parseInt(hex.substring(4, 6), 16) / 255;
    return [r, g, b];
}

function run() {
    var outputPath = "/Users/june.temp/Downloads/Namin/Namin_Color_Palette.pdf";
    var url = $.NSURL.fileURLWithPath(outputPath);
    
    var pageWidth = 595.28;  // A4
    var pageHeight = 841.89;
    var pageRect = $.NSMakeRect(0, 0, pageWidth, pageHeight);
    
    var ctx = $.CGPDFContextCreateWithURL(url, pageRect, null);
    
    var leftMargin = 38;
    var rightMargin = 38;
    var contentWidth = pageWidth - leftMargin - rightMargin; // 519.28 pt
    
    var fontTitle = $.CTFontCreateWithName($("Helvetica-Bold"), 13, null);
    var fontSub = $.CTFontCreateWithName($("Helvetica"), 8.5, null);
    var fontSection = $.CTFontCreateWithName($("Helvetica-Bold"), 10.5, null);
    var fontHeader = $.CTFontCreateWithName($("Helvetica-Bold"), 8.5, null);
    var fontBody = $.CTFontCreateWithName($("Helvetica"), 8.2, null);
    var fontBodyBold = $.CTFontCreateWithName($("Helvetica-Bold"), 8.2, null);
    var fontMono = $.CTFontCreateWithName($("Menlo-Bold"), 8, null);
    var fontMonoDim = $.CTFontCreateWithName($("Menlo"), 7.8, null);
    var fontPageNum = $.CTFontCreateWithName($("Helvetica"), 8, null);

    var curY = pageHeight - 38;
    var pageNum = 1;

    function drawClippedText(text, x, y, maxW, font, hexColor) {
        if (!text) return;
        $.CGContextSaveGState(ctx);
        $.CGContextClipToRect(ctx, $.NSMakeRect(x, y - 5, maxW, 22));
        
        var str = $(text);
        var dict = $.NSMutableDictionary.dictionary;
        dict.setObjectForKey(font, $.kCTFontAttributeName);
        var rgb = hexToRGB(hexColor);
        var color = $.CGColorCreateGenericRGB(rgb[0], rgb[1], rgb[2], 1.0);
        dict.setObjectForKey(color, $.kCTForegroundColorAttributeName);
        var attrStr = $.CFAttributedStringCreate(null, str, dict);
        var line = $.CTLineCreateWithAttributedString(attrStr);
        $.CGContextSetTextPosition(ctx, x, y);
        $.CTLineDraw(line, ctx);
        
        $.CGContextRestoreGState(ctx);
    }

    function drawRoundedRect(x, y, w, h, radius, fillHex, strokeHex, strokeWidth) {
        var path = $.CGPathCreateMutable();
        var minx = x, midx = x + w / 2, maxx = x + w;
        var miny = y, midy = y + h / 2, maxy = y + h;
        
        $.CGPathMoveToPoint(path, null, minx, midy);
        $.CGPathAddArcToPoint(path, null, minx, miny, midx, miny, radius);
        $.CGPathAddArcToPoint(path, null, maxx, miny, maxx, midy, radius);
        $.CGPathAddArcToPoint(path, null, maxx, maxy, midx, maxy, radius);
        $.CGPathAddArcToPoint(path, null, minx, maxy, minx, midy, radius);
        $.CGPathCloseSubpath(path);
        
        if (fillHex) {
            var frgb = hexToRGB(fillHex);
            $.CGContextSetRGBFillColor(ctx, frgb[0], frgb[1], frgb[2], 1.0);
            $.CGContextAddPath(ctx, path);
            $.CGContextFillPath(ctx);
        }
        if (strokeHex) {
            var srgb = hexToRGB(strokeHex);
            $.CGContextSetRGBStrokeColor(ctx, srgb[0], srgb[1], srgb[2], 1.0);
            $.CGContextSetLineWidth(ctx, strokeWidth || 1);
            $.CGContextAddPath(ctx, path);
            $.CGContextStrokePath(ctx);
        }
    }

    function startPage() {
        $.CGPDFContextBeginPage(ctx, null);
        
        // Page background
        $.CGContextSetRGBFillColor(ctx, 1.0, 1.0, 1.0, 1.0);
        $.CGContextFillRect(ctx, pageRect);
        
        // Header on page 2+
        if (pageNum > 1) {
            drawClippedText("NAMIN DESIGN SYSTEM • COLOR TOKENS", leftMargin, pageHeight - 24, 300, fontHeader, "#7A8991");
            drawClippedText("Trang " + pageNum, pageWidth - rightMargin - 40, pageHeight - 24, 40, fontPageNum, "#7A8991");
            
            // Thin rule
            $.CGContextSetRGBStrokeColor(ctx, 0.9, 0.93, 0.95, 1.0); // #E5EEF2
            $.CGContextSetLineWidth(ctx, 0.8);
            $.CGContextMoveToPoint(ctx, leftMargin, pageHeight - 28);
            $.CGContextAddLineToPoint(ctx, pageWidth - rightMargin, pageHeight - 28);
            $.CGContextStrokePath(ctx);
            
            curY = pageHeight - 44;
        } else {
            // Page 1 banner
            drawRoundedRect(leftMargin, curY - 50, contentWidth, 50, 7, "#B5E7F1", "#9DDDE9", 1);
            drawClippedText("BẢNG TỔNG HỢP MÃ MÀU ELEMENT • ỨNG DỤNG NAMIN", leftMargin + 14, curY - 20, contentWidth - 28, fontTitle, "#26343B");
            drawClippedText("Hệ thống Design Tokens chuẩn theo phong cách Pastel Sky Hearth • Ngày xuất bản: 04/11/2026", leftMargin + 14, curY - 35, contentWidth - 28, fontSub, "#1F5A7B");
            curY -= 64;
        }
    }

    function checkPageSpace(neededHeight) {
        if (curY - neededHeight < 40) {
            // Draw footer on current page
            drawClippedText("Namin Design System • Pastel Sky Hearth", leftMargin, 18, 300, fontSub, "#A7B1B7");
            drawClippedText("Trang " + pageNum, pageWidth - rightMargin - 40, 18, 40, fontPageNum, "#A7B1B7");
            
            $.CGPDFContextEndPage(ctx);
            pageNum++;
            startPage();
        }
    }

    startPage();

    var colWidths = [135, 78, 120, 186]; // Sum = 519 pt

    var sections = [
        {
            title: "1. MÀU NỀN & KHUNG GIAO DIỆN (LAYOUT & FOUNDATION)",
            headers: ["Element / Thành phần", "Mẫu & Hex", "Token / Tailwind", "Mô tả & Vị trí ứng dụng"],
            rows: [
                { name: "App Canvas", hex: "#FFF8E1", col3: "bg-canvas", desc: "Nền chính toàn bộ app (Butter Cream dịu mắt)" },
                { name: "Surface", hex: "#FFFFFF", col3: "bg-surface", desc: "Nền thẻ Card, BottomSheet, Modal, Form Input" },
                { name: "Header Band", hex: "#B5E7F1", col3: "bg-header / bg-sky", desc: "Thanh Header đầu trang & tab đang chọn" },
                { name: "Header Ink", hex: "#26343B", col3: "text-header-ink", desc: "Chữ và biểu tượng hiển thị trên thanh Header" },
                { name: "Line", hex: "#E5EEF2", col3: "border-line", desc: "Đường kẻ viền ngăn cách mảnh giữa các mục" },
                { name: "Line Strong", hex: "#D5E5EB", col3: "border-line-strong", desc: "Đường viền ô nhập liệu (Input) trạng thái chờ" },
                { name: "Soft Background", hex: "#EBF3F9", col3: "bg-soft", desc: "Nền chip phụ, badge nhạt, nút thứ cấp" },
                { name: "Floating Nav Bar", hex: "#FFFFFF", col3: "bg-surface/90", desc: "Thanh điều hướng nổi dưới đáy (kính mờ 90%)" }
            ]
        },
        {
            title: "2. MÀU CHỮ & BIỂU TƯỢNG (TYPOGRAPHY & ICONS)",
            headers: ["Thành phần chữ", "Mẫu & Hex", "Token / Tailwind", "Quy cách sử dụng"],
            rows: [
                { name: "Primary Ink", hex: "#26343B", col3: "text-ink", desc: "Tiêu đề, chữ chính, tên task/item, số tiền" },
                { name: "Sub Ink", hex: "#7A8991", col3: "text-ink-sub", desc: "Chữ phụ, nhãn ngày tháng, gợi ý, placeholder" },
                { name: "Muted Ink", hex: "#40484D", col3: "text-ink-muted", desc: "Chữ mờ nhẹ, ghi chú thời gian chi tiết" },
                { name: "Link / Action", hex: "#1F5A7B", col3: "text-link", desc: "Nút liên kết, hành động xem thêm, tab phụ" },
                { name: "Focus / Accent Icon", hex: "#217282", col3: "text-sky-dark", desc: "Viền ô input khi focus, icon nhấn mạnh" }
            ]
        },
        {
            title: "3. NÚT BẤM & TƯƠNG TÁC (BUTTONS & CONTROLS)",
            headers: ["Nút / Điều khiển", "Màu nền", "Màu chữ / Icon", "Chi tiết & Trạng thái"],
            rows: [
                { name: "Primary Button", hex: "#B5E7F1", col3: "#26343B (text-ink)", desc: "Nút Save changes / Add task. Nhấn: nền #217282 chữ trắng" },
                { name: "Secondary Button", hex: "#EBF3F9", col3: "#1F5A7B (text-link)", desc: "Nút hành động thứ cấp" },
                { name: "Ghost Button", hex: "#FFFFFF", col3: "#26343B (text-ink)", desc: "Nút viền trong suốt #E5EEF2 (Cancel, Hủy)" },
                { name: "7 nút lặp tuần (Active)", hex: "#B5E7F1", col3: "#FFFFFF (text-white)", desc: "Đồng bộ màu nút Save changes, chữ trắng in đậm" },
                { name: "7 nút lặp tuần (Inactive)", hex: "#EBF3F9", col3: "#26343B (text-ink)", desc: "Ngày không được chọn lặp" },
                { name: "Checkbox (Đã tick)", hex: "#B5E7F1", col3: "Icon tick #26343B", desc: "Hình tròn (Task) hoặc vuông bo góc (Shopping)" },
                { name: "Checkbox (Chưa tick)", hex: "#FFFFFF", col3: "Viền #D5E5EB", desc: "Khung viền rỗng chờ tick hoàn thành" },
                { name: "Pill Chips (Đang chọn)", hex: "#EBF3F9", col3: "Viền #B5E7F1", desc: "Bộ chọn Repeat, Người làm, Khu vực (chữ #26343B)" }
            ]
        },
        {
            title: "4. NHÃN TRẠNG THÁI & HUY HIỆU (BADGES & STATUSES)",
            headers: ["Trạng thái", "Màu nền", "Màu chữ", "Ý nghĩa hiển thị"],
            rows: [
                { name: "Done / In Stock", hex: "#DDF1EA", col3: "#2A6B53 (done-ink)", desc: "Task đã hoàn thành, đồ dùng còn nhiều kho" },
                { name: "Warning / Low Stock", hex: "#FFF1D8", col3: "#7D5B18 (warn-ink)", desc: "Mặt hàng sắp hết, thông báo cần chú ý" },
                { name: "Error / Overdue", hex: "#F8DEDE", col3: "#8A2E2E (err-ink)", desc: "Task trễ hạn, hết hàng, nút xóa cảnh báo" },
                { name: "Sky Info Badge", hex: "#EBF3F9", col3: "#1F5A7B (text-link)", desc: "Badge số lượng, chip thông tin thường" }
            ]
        },
        {
            title: "5. GIẤY GHI CHÚ TÁC VỤ (NOTE PAPER & STICKY NOTES)",
            headers: ["Loại giấy", "Mẫu & Hex", "Thành phần", "Quy cách thiết kế"],
            rows: [
                { name: "Sticky Note (Mặt giấy)", hex: "#FFF1B8", col3: "bg-sticky", desc: "Vàng pastel tạo cảm giác giấy ghi chú ấm cúng" },
                { name: "Sticky Note (Cạnh viền)", hex: "#E6CF78", col3: "border-sticky-edge", desc: "Viền bao quanh tờ giấy ghi chú" },
                { name: "Sticky Note (Đường kẻ)", hex: "#DCC46A", col3: "divide-sticky-line", desc: "Nét đứt ngăn cách các task trong ngày" },
                { name: "Sticky Note (Nếp gấp)", hex: "#F2DE92", col3: "bg-sticky-fold", desc: "Hiệu ứng nếp gấp góc dưới bên phải" },
                { name: "Sticky Note (Băng dính)", hex: "#B5E7F1", col3: "Băng dính dán trên", desc: "Băng keo dán góc trên độ mờ 85%, viền #9FDDE6" },
                { name: "Spiral Note (Mặt giấy)", hex: "#F4FAFD", col3: "bg-note", desc: "Xanh băng tuyết nhạt" },
                { name: "Spiral Note (Viền sổ)", hex: "#BBD8EB", col3: "border-note-edge", desc: "Đường viền sổ tay ghi chép (kẻ dòng #A2CDE4)" },
                { name: "Spiral Note (Lò xo)", hex: "#7AAECB", col3: "border-note-ring", desc: "Họa tiết vòng lò xo xoắn sổ tay kim loại" }
            ]
        },
        {
            title: "6. DANH MỤC ĐỒ DÙNG TRONG NHÀ (HOUSEHOLD CATEGORIES)",
            headers: ["Danh mục đồ dùng", "Mẫu & Hex", "Token hệ thống", "Ý nghĩa & Đồ dùng tiêu biểu"],
            rows: [
                { name: "Cleaning", hex: "#8CC9E8", col3: "cat-cleaning", desc: "Dọn dẹp, tẩy rửa, bột giặt, nước lau nhà" },
                { name: "Kitchen", hex: "#A9D8C8", col3: "cat-kitchen", desc: "Đồ bếp, túi rác, màng bọc, nước rửa bát" },
                { name: "Bathroom", hex: "#B8C7E6", col3: "cat-bathroom", desc: "Phòng tắm, dầu gội, sữa tắm, kem đánh răng" },
                { name: "Groceries", hex: "#F2D6A7", col3: "cat-groceries", desc: "Thực phẩm, gia vị, dầu ăn, gạo, trứng, sữa" },
                { name: "Maintenance", hex: "#D7C4E8", col3: "cat-maintenance", desc: "Sửa chữa, bóng đèn, pin, băng keo, lọc nước" },
                { name: "Other", hex: "#CBD5DA", col3: "cat-other", desc: "Đồ dùng tiêu hao khác" }
            ]
        },
        {
            title: "7. KHU VỰC PHÒNG TRONG NHÀ (ROOM TAG BADGES)",
            headers: ["Khu vực / Phòng", "Màu nền (Badge)", "Màu icon & chữ", "Đặc điểm tông màu"],
            rows: [
                { name: "Kitchen (Bếp)", hex: "#FBF0DC", col3: "#8A6420", desc: "Tông vàng mật ong ấm cúng" },
                { name: "Living (Phòng khách)", hex: "#E3F2FA", col3: "#2F7FA6", desc: "Tông xanh lam nhạt tươi mát" },
                { name: "Bathroom (Phòng tắm)", hex: "#E9EEF8", col3: "#4A5F96", desc: "Tông xanh tím than nhã nhặn" },
                { name: "Bedroom (Phòng ngủ)", hex: "#F2EBF8", col3: "#6F4E92", desc: "Tông tím nho pastel dịu nhẹ" },
                { name: "Laundry (Giặt giũ)", hex: "#ECF1F3", col3: "#55666E", desc: "Tông xám sương chì sạch sẽ" },
                { name: "Outdoor (Ngoài trời)", hex: "#E3F3EE", col3: "#2F7562", desc: "Tông xanh cây cỏ thiên nhiên" }
            ]
        },
        {
            title: "8. TÀI KHOẢN & VÍ THANH TOÁN (WALLET ACCOUNTS)",
            headers: ["Loại ví / Tài khoản", "Mẫu & Hex", "Định danh màu", "Phân loại mặc định"],
            rows: [
                { name: "Cash (Tiền mặt)", hex: "#3FA88B", col3: "Green / Emerald", desc: "Ví tiền mặt chi tiêu hàng ngày" },
                { name: "Bank Account (Ngân hàng)", hex: "#4B7BFF", col3: "Royal Blue", desc: "Tài khoản ngân hàng chính" },
                { name: "E-Wallet (Ví điện tử)", hex: "#E9A3E0", col3: "Hồng tím pastel", desc: "Ví điện tử Momo, ZaloPay, ShopeePay" },
                { name: "Savings / Gold (Vàng)", hex: "#F59E0B", col3: "Amber / Gold", desc: "Quỹ tiết kiệm, tài sản tích lũy" },
                { name: "Credit Card (Thẻ tín dụng)", hex: "#EF4444", col3: "Coral Red", desc: "Thẻ tín dụng, khoản vay nợ" },
                { name: "Cyan Account", hex: "#06B6D4", col3: "Cyan Blue", desc: "Tài khoản cá nhân phụ 1" },
                { name: "Violet Account", hex: "#8B5CF6", col3: "Violet", desc: "Tài khoản cá nhân phụ 2" },
                { name: "Slate Account", hex: "#64748B", col3: "Mineral Slate", desc: "Tài khoản chi tiêu chung khác" }
            ]
        },
        {
            title: "9. BIỂU ĐỒ THU CHI TÀI CHÍNH (FINANCIAL CHARTS PALETTE)",
            headers: ["Thành phần biểu đồ", "Mẫu & Hex", "Vai trò màu", "Mô tả chuẩn tương phản"],
            rows: [
                { name: "Header trang Charts", hex: "#7B4B3A", col3: "Nâu ấm cổ điển", desc: "Thanh tiêu đề trang Charts riêng biệt (chữ trắng #FFFFFF)" },
                { name: "Biểu đồ Phân mục 1", hex: "#3E97C8", col3: "Slot 1 (Blue)", desc: "Chuẩn hóa độ tách biệt màu sắc cho mắt" },
                { name: "Biểu đồ Phân mục 2", hex: "#E5806A", col3: "Slot 2 (Coral)", desc: "Chuẩn hóa độ tách biệt màu sắc cho mắt" },
                { name: "Biểu đồ Phân mục 3", hex: "#5A7FCC", col3: "Slot 3 (Indigo)", desc: "Chuẩn hóa độ tách biệt màu sắc cho mắt" },
                { name: "Biểu đồ Phân mục 4", hex: "#D29A26", col3: "Slot 4 (Mustard)", desc: "Chuẩn hóa độ tách biệt màu sắc cho mắt" },
                { name: "Biểu đồ Phân mục 5", hex: "#8A72C4", col3: "Slot 5 (Purple)", desc: "Chuẩn hóa độ tách biệt màu sắc cho mắt" },
                { name: "Biểu đồ Phân mục 6", hex: "#3FA88B", col3: "Slot 6 (Teal)", desc: "Chuẩn hóa độ tách biệt màu sắc cho mắt" },
                { name: "Chi tiêu khác (Others)", hex: "#A7B1B7", col3: "Neutral Gray", desc: "Nhóm các mục chi tiêu nhỏ còn lại" }
            ]
        }
    ];

    for (var s = 0; s < sections.length; s++) {
        var sec = sections[s];
        
        var minNeeded = 16 + 18 + 2 * 19;
        checkPageSpace(minNeeded);

        // Section title
        drawClippedText(sec.title, leftMargin, curY - 9, contentWidth, fontSection, "#1F5A7B");
        
        // Underline
        $.CGContextSetRGBStrokeColor(ctx, 0.85, 0.91, 0.94, 1.0); // #D5E5EB
        $.CGContextSetLineWidth(ctx, 1.0);
        $.CGContextMoveToPoint(ctx, leftMargin, curY - 13);
        $.CGContextAddLineToPoint(ctx, pageWidth - rightMargin, curY - 13);
        $.CGContextStrokePath(ctx);
        
        curY -= 18;

        // Table Header
        var rowHeight = 18.5;
        drawRoundedRect(leftMargin, curY - rowHeight, contentWidth, rowHeight, 3, "#EBF3F9", "#D5E5EB", 0.6);
        
        var curX = leftMargin;
        for (var h = 0; h < sec.headers.length; h++) {
            drawClippedText(sec.headers[h], curX + 6, curY - 12.5, colWidths[h] - 10, fontHeader, "#1F5A7B");
            curX += colWidths[h];
        }
        curY -= rowHeight;

        // Rows
        for (var r = 0; r < sec.rows.length; r++) {
            checkPageSpace(rowHeight + 4);
            var item = sec.rows[r];
            var isEven = (r % 2 === 1);
            
            // Row background
            if (isEven) {
                drawRoundedRect(leftMargin, curY - rowHeight, contentWidth, rowHeight, 0, "#F8FBFC", null, 0);
            }
            
            // Bottom hairline
            $.CGContextSetRGBStrokeColor(ctx, 0.93, 0.95, 0.97, 1.0); // #EDF2F5
            $.CGContextSetLineWidth(ctx, 0.5);
            $.CGContextMoveToPoint(ctx, leftMargin, curY - rowHeight);
            $.CGContextAddLineToPoint(ctx, pageWidth - rightMargin, curY - rowHeight);
            $.CGContextStrokePath(ctx);

            var xCol = leftMargin;
            
            // Col 1: Name
            drawClippedText(item.name, xCol + 6, curY - 12.5, colWidths[0] - 10, fontBodyBold, "#26343B");
            xCol += colWidths[0];

            // Col 2: Swatch + Hex
            drawRoundedRect(xCol + 6, curY - 14.5, 11, 11, 2.5, item.hex, "#000000", 0.2);
            drawClippedText(item.hex, xCol + 21, curY - 12.5, colWidths[1] - 24, fontMono, "#26343B");
            xCol += colWidths[1];

            // Col 3: Token / Hex / Info
            drawClippedText(item.col3, xCol + 6, curY - 12.5, colWidths[2] - 10, fontMonoDim, "#55666E");
            xCol += colWidths[2];

            // Col 4: Description
            drawClippedText(item.desc, xCol + 6, curY - 12.5, colWidths[3] - 10, fontBody, "#40484D");

            curY -= rowHeight;
        }

        curY -= 10; // Spacing after section
    }

    // Draw final page footer
    drawClippedText("Namin Design System • Pastel Sky Hearth • Xuất file ngày 04/11/2026", leftMargin, 18, 300, fontSub, "#A7B1B7");
    drawClippedText("Trang " + pageNum, pageWidth - rightMargin - 40, 18, 40, fontPageNum, "#A7B1B7");

    $.CGPDFContextEndPage(ctx);
    $.CGPDFContextClose(ctx);
    console.log("PDF Created Successfully! Total pages:", pageNum);
}

run();
