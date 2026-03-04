/**
 * Salon Reservation System - Backend (GAS API)
 */

// TODO: スプレッドシートのURLから取得した固定のID（文字列）を代入してください
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE'; 
const LADY_CALENDAR_ID = 'YOUR_LADY_CALENDAR_ID_HERE';
const MEN_CALENDAR_ID = 'YOUR_MEN_CALENDAR_ID_HERE';

function doPost(e) {
  try {
    let params;
    
    // x-www-form-urlencoded で送信されたパラメータを取得
    if (e.parameter && e.parameter.payload) {
      params = JSON.parse(e.parameter.payload);
    } else {
      throw new Error("No payload provided in the request.");
    }

    const action = params.action;
    let result;
    
    if (action === 'getMenuData') {
      result = getMenuData(params.gender);
    } else if (action === 'getAvailableSlots') {
      result = getAvailableSlots(params.dateStr, params.durationMin);
    } else if (action === 'createBooking') {
      result = createBooking(params.details);
    } else if (action === 'updateMenuData') {
      result = updateMenuData(params);
    } else {
      throw new Error("Unknown action: " + action);
    }
    
    // ■修正点：必ず文字列として返しブラウザ側で解釈しやすくする（ContentService.MimeType.TEXT）
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

function getMenuData(gender) {
  let data = [];
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Menus');
    if (sheet) {
      data = sheet.getDataRange().getValues();
    }
  } catch (e) {
    // シートが見つからないなどのエラー時
    console.warn("Spreadsheet error:", e);
  }
  
  // データが空（ヘッダーすらない）の場合はダミーデータを返す
  if (!data || data.length <= 1) {
    return getDummyData(gender);
  }

  // ヘッダーの余分な空白を削除
  const headers = data[0].map(h => (h !== undefined && h !== null) ? h.toString().trim() : '');
  const rows = data.slice(1);
  
  // ■修正点：引数のジェンダーを小文字化してトリム（空白除去）
  const targetGender = gender ? gender.toString().toLowerCase().trim() : '';
  
  const result = [];
  rows.forEach((row, rowIndex) => {
    // ■修正点：スプレッドシートの性別カラム（index 1）も小文字・空白除去して比較
    const rowGender = (row[1] !== undefined && row[1] !== null) ? row[1].toString().toLowerCase().trim() : '';
    
    if (rowGender === targetGender) {
      let obj = {};
      headers.forEach((header, colIndex) => {
        obj[header] = row[colIndex] instanceof Date 
            ? row[colIndex].toISOString() 
            : (row[colIndex] !== undefined && row[colIndex] !== null ? row[colIndex] : '');
      });
      obj.rowId = rowIndex + 2; 
      result.push(obj);
    }
  });

  // レスポンスが空になってしまった場合は、ダミーデータを返す
  if (result.length === 0) {
    return getDummyData(gender);
  }
  
  return result;
}

// ■修正点：データが見つからなかった場合のダミーテストデータ（デバッグ用）
function getDummyData(gender) {
  return [{
    rowId: 999,
    Gender: gender,
    Name: '【テストデータ】ご希望のメニュー',
    Duration: 60,
    Price: 5000,
    Description: '※スプレッドシートからデータが取得できなかった場合のテスト用データです。スプレッドシートのIDとアクセス権限を確認してください。',
    Coupon: true
  }];
}

function updateMenuData(params) {
  const { rowId, updateObj } = params;
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Menus');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => h.toString().trim());
  
  for (let key in updateObj) {
    const colIndex = headers.indexOf(key.trim()) + 1;
    if (colIndex > 0) {
      sheet.getRange(rowId, colIndex).setValue(updateObj[key]);
    }
  }
  return { success: true };
}

function getAvailableSlots(dateStr, durationMin) {
  const targetDate = new Date(dateStr);
  const startTime = new Date(targetDate.setHours(10, 0, 0, 0)); 
  const endTime = new Date(targetDate.setHours(20, 0, 0, 0));   
  
  const now = new Date();
  const bufferTime = new Date(now.getTime() + (60 * 60 * 1000)); 
  
  const events = [];
  try {
    const ladyCal = CalendarApp.getCalendarById(LADY_CALENDAR_ID);
    const searchStart = new Date(targetDate.setHours(0,0,0,0));
    const searchEnd = new Date(targetDate.setHours(23,59,59,999));
    if (ladyCal) events.push(...ladyCal.getEvents(searchStart, searchEnd));
  } catch(e) {}

  try {
    const menCal = CalendarApp.getCalendarById(MEN_CALENDAR_ID);
    const searchStart = new Date(targetDate.setHours(0,0,0,0));
    const searchEnd = new Date(targetDate.setHours(23,59,59,999));
    if (menCal) events.push(...menCal.getEvents(searchStart, searchEnd));
  } catch(e) {}
  
  const slots = [];
  let currentPos = new Date(startTime);
  
  while (currentPos.getTime() + (durationMin * 60 * 1000) <= endTime.getTime()) {
    if (currentPos.getTime() <= bufferTime.getTime()) {
      currentPos.setTime(currentPos.getTime() + (30 * 60 * 1000));
      continue;
    }
    
    const slotEnd = new Date(currentPos.getTime() + (durationMin * 60 * 1000));
    
    const isOverlap = events.some(event => {
      const eStart = event.getStartTime().getTime();
      const eEnd = event.getEndTime().getTime();
      const sStart = currentPos.getTime();
      const sEnd = slotEnd.getTime();
      return (sStart < eEnd && sEnd > eStart);
    });
    
    if (!isOverlap) {
      slots.push(Utilities.formatDate(currentPos, "JST", "HH:mm"));
    }
    
    currentPos.setTime(currentPos.getTime() + (30 * 60 * 1000)); 
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
