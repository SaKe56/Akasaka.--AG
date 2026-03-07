/**
 * Salon Reservation System - Backend (GAS API)
 * Updated for: Admin Password, Category Levels, 1-Month Calendar Optimization, Stable Comm
 */

const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE'; 
const LADY_CALENDAR_ID = 'YOUR_LADY_CALENDAR_ID_HERE';
const MEN_CALENDAR_ID = 'YOUR_MEN_CALENDAR_ID_HERE';
// TODO: 管理画面の合言葉（パスワード）を設定してください
const ADMIN_PASSWORD = 'ar123';

function doPost(e) {
  try {
    let params;
    
    if (e.parameter && e.parameter.payload) {
      params = JSON.parse(e.parameter.payload);
    } else {
      throw new Error("No payload provided in the request.");
    }

    const action = params.action;
    let result;
    
    if (action === 'getMenusByCategory') {
      result = getMenusByCategory(params.gender);
    } else if (action === 'verifyPassword') {
      result = verifyPassword(params.password);
    } else if (action === 'getAvailableSlots') {
      result = getAvailableSlots(params.dateStr, params.durationMin, params.gender);
    } else if (action === 'createBooking') {
      result = createBooking(params.details);
    } else if (action === 'updateMenuData') {
      result = updateMenuData(params);
    } else if (action === 'deleteMenuData') {
      result = deleteMenuData(params);
    } else if (action === 'addMenuData') {
      result = addMenuData(params);
    } else {
      throw new Error("Unknown action: " + action);
    }
    
    // 安定通信: ブラウザがJSON解釈エラーを起こさないよう、必ず文字列化してTEXTで返す
    const responsePayload = JSON.stringify({ status: 'success', data: result });
    return ContentService.createTextOutput(responsePayload)
      .setMimeType(ContentService.MimeType.TEXT);

  } catch (error) {
    const errorPayload = JSON.stringify({ status: 'error', message: error.toString() });
    return ContentService.createTextOutput(errorPayload)
      .setMimeType(ContentService.MimeType.TEXT);
  }
}

function doGet(e) {
  return ContentService.createTextOutput("GAS backend is working as an API. Please use POST requests.")
    .setMimeType(ContentService.MimeType.TEXT);
}

// ==========================================
// Menu Data Handlers (Category Supported)
// ==========================================

function getMenusByCategory(gender) {
  let data = [];
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Menus');
    if (sheet) {
      data = sheet.getDataRange().getValues();
    }
  } catch (e) {
    console.warn("Spreadsheet error:", e);
  }
  
  if (!data || data.length <= 1) {
    return getDummyData(gender);
  }

  const headers = data[0].map(h => (h !== undefined && h !== null) ? h.toString().trim() : '');
  const rows = data.slice(1);
  const targetGender = gender ? gender.toString().toLowerCase().trim() : '';
  
  const result = {};
  
  rows.forEach((row, rowIndex) => {
    const rowGender = (row[1] !== undefined && row[1] !== null) ? row[1].toString().toLowerCase().trim() : '';
    
    if (rowGender === targetGender || !targetGender) { // 性別一致または管理者用に全取得
      let obj = {};
      headers.forEach((header, colIndex) => {
        obj[header] = row[colIndex] instanceof Date 
            ? row[colIndex].toISOString() 
            : (row[colIndex] !== undefined && row[colIndex] !== null ? row[colIndex] : '');
      });
      obj.rowId = rowIndex + 2;
      
      // H列 (Category) などを想定。なければ「その他」へ振り分け
      const category = obj["Category"] || obj["H列 (Category)"] || obj["カテゴリ"] || "その他";
      
      if (!result[category]) {
        result[category] = [];
      }
      result[category].push(obj);
    }
  });

  if (Object.keys(result).length === 0) {
    return getDummyData(gender);
  }
  
  return result;
}

function verifyPassword(password) {
  if (password !== ADMIN_PASSWORD) throw new Error("認証に失敗しました。パスワードが間違っています。");
  return { verified: true };
}

function getDummyData(gender) {
  return {
    "フェイシャル": [{
      rowId: 999,
      Gender: gender,
      Name: '【テスト】フェイシャル60分',
      Duration: 60,
      Price: 5000,
      Description: 'テスト用データです。シートIDまたはCategory列を確認してください。',
      Coupon: true
    }]
  };
}

// ==========================================
// Admin Sheet Modification Handlers
// ==========================================

function updateMenuData(params) {
  const { password, rowId, updateObj } = params;
  if (password !== ADMIN_PASSWORD) throw new Error("認証に失敗しました。パスワードが間違っています。");

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Menus');
  
  // スマホやPCで行が入れ替わったり日本語ヘッダーが変更されても絶対にバグらないように
  // スプレッドシートの列（A,B,C...）に対して完全に固定で書き込むマッピング
  const colMap = {
    "Gender": 2,      // B列
    "Name": 3,        // C列
    "Duration": 4,    // D列
    "Price": 5,       // E列
    "Description": 6, // F列
    "Coupon": 7,      // G列
    "Category": 8     // H列
  };
  
  for (let key in updateObj) {
    if (colMap[key]) {
      sheet.getRange(rowId, colMap[key]).setValue(updateObj[key]);
    }
  }
  return { success: true };
}

function deleteMenuData(params) {
  const { password, rowId } = params;
  if (password !== ADMIN_PASSWORD) throw new Error("認証に失敗しました。パスワードが間違っています。");

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Menus');
  sheet.deleteRow(rowId);
  return { success: true };
}

function addMenuData(params) {
  const { password, newObj } = params;
  if (password !== ADMIN_PASSWORD) throw new Error("認証に失敗しました。パスワードが間違っています。");

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Menus');
  
  // A列: ID, B列: Gender, C列: Name, D列: Duration, E列: Price, F列: Description, G列: Coupon, H列: Category
  const newRow = [];
  newRow[0] = new Date().getTime();                  // A列 ID (タイムスタンプで一意に生成)
  newRow[1] = newObj.Gender || "Lady's";            // B列 性別
  newRow[2] = newObj.Name || "";                    // C列 メニュー名
  newRow[3] = newObj.Duration || 60;                // D列 時間
  newRow[4] = newObj.Price || 0;                    // E列 料金
  newRow[5] = newObj.Description || "";             // F列 詳細
  newRow[6] = newObj.Coupon ? "有" : "";            // G列 クーポン
  newRow[7] = newObj.Category || "その他";          // H列 カテゴリ
  
  sheet.appendRow(newRow);
  
  return { success: true };
}

// ==========================================
// Booking & Calendar Handlers
// ==========================================

function getAvailableSlots(dateStr, durationMin, gender) {
  const targetDate = new Date(dateStr);
  const startTime = new Date(targetDate.setHours(10, 0, 0, 0));
  const endTime = new Date(targetDate.setHours(20, 0, 0, 0));

  const now = new Date();
  // 当日予約の制限: 現在時刻から「1時間後」より後の枠のみ表示
  const bufferTime = new Date(now.getTime() + (60 * 60 * 1000));

  const targetGender = gender ? gender.toString().toLowerCase() : '';
  const isLady = !targetGender || targetGender.includes('lady');
  const isMen  = !targetGender || !targetGender.includes('lady');

  const searchStart = new Date(targetDate.setHours(0, 0, 0, 0));
  const searchEnd   = new Date(targetDate.setHours(23, 59, 59, 999));

  const events = [];
  if (isLady) {
    try {
      const ladyCal = CalendarApp.getCalendarById(LADY_CALENDAR_ID);
      if (ladyCal) events.push(...ladyCal.getEvents(searchStart, searchEnd));
    } catch(e) { console.error("Lady calendar error:", e); }
  }
  if (isMen) {
    try {
      const menCal = CalendarApp.getCalendarById(MEN_CALENDAR_ID);
      if (menCal) events.push(...menCal.getEvents(searchStart, searchEnd));
    } catch(e) { console.error("Men calendar error:", e); }
  }

  const slots = [];
  let currentPos = new Date(startTime);

  // 15分間隔で空き枠を計算
  while (currentPos.getTime() + (durationMin * 60 * 1000) <= endTime.getTime()) {
    if (currentPos.getTime() < bufferTime.getTime()) {
      currentPos.setTime(currentPos.getTime() + (15 * 60 * 1000));
      continue;
    }
    
    const slotEnd = new Date(currentPos.getTime() + (durationMin * 60 * 1000));
    
    const isOverlap = events.some(event => {
      const eStart = event.getStartTime().getTime();
      const eEnd = event.getEndTime().getTime();
      const sStart = currentPos.getTime();
      const sEnd = slotEnd.getTime();
      // 時間が少しでも被っていれば true
      return (sStart < eEnd && sEnd > eStart);
    });
    
    if (!isOverlap) {
      slots.push(Utilities.formatDate(currentPos, "JST", "HH:mm"));
    }
    
    currentPos.setTime(currentPos.getTime() + (15 * 60 * 1000)); 
  }
  
  return slots;
}

function createBooking(details) {
  const { gender, menuName, dateStr, timeStr, durationMin, customerName } = details;
  
  const calId = gender.toString().toLowerCase().includes('lady') ? LADY_CALENDAR_ID : MEN_CALENDAR_ID;
  const cal = CalendarApp.getCalendarById(calId);
  
  const start = new Date(dateStr + ' ' + timeStr);
  const end = new Date(start.getTime() + (durationMin * 60 * 1000));
  
  if (cal) {
    cal.createEvent(`[${gender}] ${customerName} - ${menuName}`, start, end);
  }
  
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Reservations');
  if (sheet) {
    sheet.appendRow([new Date(), dateStr, timeStr, menuName, gender, customerName]);
  }
  
  return { success: true };
}
