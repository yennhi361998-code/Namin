import fs from 'fs';
import XLSX from 'xlsx';

const raw = fs.readFileSync('/Users/june.temp/.gemini/antigravity/brain/ce619326-d1f0-479f-ac6a-8dde50e2c288/.user_uploaded/media_1792063510552.csv', 'utf8');
const lines = raw.split(/\r?\n/);
const headerIdx = lines.findIndex(l => l.startsWith('Date,Category,Amount'));

function parseCSVLine(line) {
  const parts = [];
  let curr = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        curr += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === ',' && !inQuote) {
      parts.push(curr);
      curr = '';
    } else {
      curr += ch;
    }
  }
  parts.push(curr);
  return parts;
}

const dataLines = lines.slice(headerIdx + 1).filter(l => l.trim().length > 0);

// Normalization maps for Category
const categoryMap = {
  'Transport': 'Traffic',
  'Communication': 'Bill',
  'Gifts': 'Gift',
  'Thui': 'Family',
};

function normalizeTitle(rawNote, category, type, toAcc) {
  const trimmed = (rawNote || '').trim();
  if (!trimmed) {
    if (type === 'Transfer' && toAcc) {
      return `Chuyển đến ${toAcc}`;
    }
    return category || (type === 'Transfer' ? 'Chuyển khoản' : 'Giao dịch');
  }

  let s = trimmed;

  // Exact match dictionary
  const exactMap = {
    // Convenience Stores
    'gs': 'GS25',
    'gs25': 'GS25',
    'GS': 'GS25',
    '711': '7-Eleven',
    '7-11': '7-Eleven',
    'ministop': 'Ministop',

    // Drinks
    'cf': 'Cà phê',
    'cafe': 'Cà phê',
    'cà phê': 'Cà phê',
    'ts': 'Trà sữa',
    'tsua': 'Trà sữa',
    'trà sữa': 'Trà sữa',
    'matcha': 'Matcha',

    // Transport
    'grab': 'Grab',
    'be': 'Be',
    'xanh': 'Xanh SM',
    'xanh sm': 'Xanh SM',
    'taxi': 'Taxi',
    'xe': 'Tiền xe',
    'giữ xe': 'Giữ xe',
    'gửi xe': 'Giữ xe',

    // Bill / Telecom
    'dt': 'Nạp tiền điện thoại',
    'đt': 'Nạp tiền điện thoại',
    'nạp dt': 'Nạp tiền điện thoại',
    'nạp đt': 'Nạp tiền điện thoại',
    'nap dt': 'Nạp tiền điện thoại',
    '4g': 'Cước 4G',
    '4G': 'Cước 4G',
    'sim 4g': 'Cước 4G',
    'sim 4G': 'Cước 4G',
    'phi the': 'Phí duy trì thẻ',
    'phí thẻ': 'Phí duy trì thẻ',
    'phí duy trì tk': 'Phí duy trì tài khoản',
    'phí thẻ ghi nợ :)': 'Phí duy trì thẻ ghi nợ',
    'sms': 'Phí SMS Banking',

    // Personal / Daily
    'bvs': 'Băng vệ sinh',
    'srm': 'Sữa rửa mặt',
    'kcn': 'Kem chống nắng',
    'ckd': 'Kem che khuyết điểm',
    'ckđ': 'Kem che khuyết điểm',
    'nc hoa': 'Nước hoa',
    'kính cg lực': 'Kính cường lực',
    'cg lực': 'Kính cường lực',
    'cường lực': 'Kính cường lực',
    'ốp': 'Ốp lưng',
    'củ sạc': 'Củ sạc',
    'dây sạc': 'Dây sạc',

    // Clothes
    '2 áo': 'Áo (2 cái)',
    '2 cái quần': 'Quần (2 cái)',
    'sơ mi': 'Áo sơ mi',

    // Entertainment & Gifts
    'blindbox': 'Blind box',
    'blind box': 'Blind box',
    'smiski': 'Smiski',
    'smiski loopy': 'Smiski Loopy',
    'vé xem phim': 'Vé xem phim',
    'xem phim': 'Vé xem phim',
    'lì xi': 'Lì xì',
    'hộp qà': 'Hộp quà',
    'vé số': 'Vé số',
    've so': 'Vé số',

    // Health
    'khám pk': 'Khám phụ sản',
    'khám ps': 'Khám phụ sản',
    'khám phụ sản': 'Khám phụ sản',

    // Transfers
    'thanh toán thẻ': 'Thanh toán thẻ tín dụng',
  };

  const lower = s.toLowerCase();
  if (exactMap[lower]) {
    return exactMap[lower];
  }

  // Phrase replacements
  s = s.replace(/\bqà\s+sn\b/gi, 'quà sinh nhật');
  s = s.replace(/\bquà\s+sn\b/gi, 'quà sinh nhật');
  s = s.replace(/\bqà\b/gi, 'quà');

  // Regex prefix / phrase replacements
  if (/^cf\s+/i.test(s)) {
    s = 'Cà phê ' + s.slice(3).trim();
  } else if (/^ts\s+/i.test(s)) {
    s = 'Trà sữa ' + s.slice(3).trim();
  } else if (/^qà\s+/i.test(s) || /^quà\s+/i.test(s)) {
    s = 'Quà ' + s.slice(s.indexOf(' ') + 1).trim();
  } else if (/^thanh toán thẻ\s+t(\d+)/i.test(s)) {
    s = s.replace(/^thanh toán thẻ\s+t(\d+)/i, 'Thanh toán thẻ tín dụng T$1');
  } else if (/^tt thẻ\s+t(\d+)/i.test(s)) {
    s = s.replace(/^tt thẻ\s+t(\d+)/i, 'Thanh toán thẻ tín dụng T$1');
  } else if (/^thanh toán ttd\s+t(\d+)/i.test(s)) {
    s = s.replace(/^thanh toán ttd\s+t(\d+)/i, 'Thanh toán thẻ tín dụng T$1');
  } else if (/^lương\s+t(\d+)/i.test(s) || /^luong\s+t(\d+)/i.test(s)) {
    s = s.replace(/^(lương|luong)\s+t(\d+)/i, 'Lương T$2');
  } else if (/^grab\s+/i.test(s)) {
    s = 'Grab ' + s.slice(5).trim();
  }

  // Capitalize first letter if lowercase
  if (s.length > 0 && s[0] === s[0].toLowerCase()) {
    s = s[0].toUpperCase() + s.slice(1);
  }

  return s;
}

// Transform all rows
const myWalletRows = [];
const accountsSet = new Map();

dataLines.forEach((line) => {
  const [dateStr, rawCat, amountStr, rawType, rawAcc, rawMember, curr, ledger, rawNote, rawToAcc] = parseCSVLine(line);

  const date = dateStr ? dateStr.slice(0, 10) : '';
  const type = (rawType || 'Expense').toUpperCase();
  const cat = categoryMap[rawCat] || rawCat || (type === 'TRANSFER' ? '' : 'Others');
  const amount = parseFloat(amountStr) || 0;
  const acc = (rawAcc || '').trim();
  const toAcc = (rawToAcc || '').trim();
  const member = (rawMember || 'Me').trim();
  const note = (rawNote || '').trim();

  const title = normalizeTitle(note, cat, rawType, toAcc);

  // Register accounts
  if (acc) {
    const isDebt = /tín dụng|tin dung|credit/i.test(acc);
    accountsSet.set(acc, {
      name: acc,
      scope: 'Personal',
      nature: isDebt ? 'Debt' : 'Asset',
    });
  }
  if (toAcc) {
    const isJoint = /quỹ vợ chồng|household/i.test(toAcc);
    const isDebt = /tín dụng|tin dung|credit/i.test(toAcc);
    accountsSet.set(toAcc, {
      name: toAcc,
      scope: isJoint ? 'Household' : 'Personal',
      nature: isDebt ? 'Debt' : 'Asset',
    });
  }

  myWalletRows.push({
    'Date': date,
    'Type': type,
    'Item / Title': title,
    'Category': cat,
    'Amount': amount,
    'Account': acc,
    'To Account': toAcc,
    'Member': member,
    'Notes': note,
  });
});

console.log('Total processed My_Wallet rows:', myWalletRows.length);
console.log('Distinct Accounts found:', accountsSet.size);

// Create Accounts rows
const accountsRows = Array.from(accountsSet.values()).map(a => ({
  'Account Name': a.name,
  'Scope': a.scope,
  'Nature': a.nature,
  'Initial Balance': 0,
}));

// Build Workbook
const wb = XLSX.utils.book_new();

// Sheet: My_Wallet
const wsMyWallet = XLSX.utils.json_to_sheet(myWalletRows);
wsMyWallet['!cols'] = [
  { wch: 12 }, // Date
  { wch: 10 }, // Type
  { wch: 32 }, // Item / Title
  { wch: 16 }, // Category
  { wch: 14 }, // Amount
  { wch: 20 }, // Account
  { wch: 20 }, // To Account
  { wch: 10 }, // Member
  { wch: 35 }, // Notes
];
XLSX.utils.book_append_sheet(wb, wsMyWallet, 'My_Wallet');

// Sheet: Accounts
const wsAccounts = XLSX.utils.json_to_sheet(accountsRows);
wsAccounts['!cols'] = [
  { wch: 24 }, // Account Name
  { wch: 14 }, // Scope
  { wch: 12 }, // Nature
  { wch: 16 }, // Initial Balance
];
XLSX.utils.book_append_sheet(wb, wsAccounts, 'Accounts');

const outputPath = '/Users/june.temp/Downloads/Namin/Namin_Import_Nhi_Wallet.xlsx';
XLSX.writeFile(wb, outputPath);
console.log('Successfully written to:', outputPath);
