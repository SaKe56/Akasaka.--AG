/**
 * Salon Reservation System - Backend (GAS API for external frontend)
 * Setup:
 * 1. Create a Spreadsheet with two sheets: "Menus" and "Reservations".
 * 2. Menus Sheet Columns: ID, Gender, Name, Duration, Price, Description, Coupon
 * 3. Reservations Sheet Columns: Timestamp, Date, Time, MenuName, Gender, CustomerName
 */

const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
const LADY_CALENDAR_ID = 'YOUR_LADY_CALENDAR_ID_HERE'; // Change this
const MEN_CALENDAR_ID = 'YOUR_MEN_CALENDAR_ID_HERE';   // Change this

// CORSやリダイレクト時のOAuthエラーを完全に回避するJSONP用の処理
function doGet(e) {
  try {
    const action = e.parameter.action;
    const callback = e.parameter.callback; // フロントエンドから渡される関数名
    if (!callback) throw new Error("No callback provided for JSONP.");

    let result;
    
    // アクションごとの処理分岐
    if (action === 'getMenuData') {
      result = getMenuData(e.parameter.gender);
    } else if (action === 'getAvailableSlots') {
      result = getAvailableSlots(e.parameter.dateStr, parseInt(e.parameter.durationMin, 10));
    } else if (action === 'createBooking') {
      const details = JSON.parse(e.parameter.details);
      result = createBooking(details);
    } else if (action === 'updateMenuData') {
      const updateObj = JSON.parse(e.parameter.updateObj);
      result = updateMenuData({ rowId: parseInt(e.parameter.rowId, 10), updateObj: updateObj });
    } else {
      throw new Error("Unknown action: " + action);
    }
    
    // 成功時: JSの関数呼び出し形式でテキストを返す（MimeTypeはJAVASCRIPT）
    const jsonString = JSON.stringify({ status: 'success', data: result });
    return ContentService.createTextOutput(`${callback}(${jsonString});`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
      
  } catch (error) {
    // エラー時: 同じくコールバック関数にエラー内容を渡して返す
    const callback = (e.parameter && e.parameter.callback) ? e.parameter.callback : 'console.error';
    const jsonString = JSON.stringify({ status: 'error', message: error.toString() });
    return ContentService.createTextOutput(`${callback}(${jsonString});`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
}

// POSTリクエストが来た場合のフォールバック
function doPost(e) {
  return ContentService.createTextOutput("This API now uses JSONP via GET requests to prevent CORS/OAuth errors.")
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Fetch menus based on gender
 */
function getMenuData(gender) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Menus');
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();
  
  return data
    .filter(row => row[1] === gender)
    .map((row, index) => {
      let obj = {};
      headers.forEach((header, i) => {
        // Convert dates or other complex objects to primitives
        obj[header] = row[i] instanceof Date ? row[i].toISOString() : row[i];
      });
      obj.rowId = index + 2; // For editing
      return obj;
    });
}

/**
 * Admin: Update menu data
 */
function updateMenuData(params) {
  const { rowId, updateObj } = params;
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Menus');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  for (let key in updateObj) {
    const colIndex = headers.indexOf(key) + 1;
    if (colIndex > 0) {
      sheet.getRange(rowId, colIndex).setValue(updateObj[key]);
    }
  }
  return { success: true };
}

/**
 * Calculate available time slots
 */
function getAvailableSlots(dateStr, durationMin) {
  const targetDate = new Date(dateStr);
  const startTime = new Date(targetDate.setHours(10, 0, 0, 0)); // Open 10:00
  const endTime = new Date(targetDate.setHours(20, 0, 0, 0));   // Close 20:00
  
  const now = new Date();
  const bufferTime = new Date(now.getTime() + (60 * 60 * 1000)); // 1 hour later
  
  // Get all events from both calendars
  const ladyCal = CalendarApp.getCalendarById(LADY_CALENDAR_ID);
  const menCal = CalendarApp.getCalendarById(MEN_CALENDAR_ID);
  
  const searchStart = new Date(targetDate.setHours(0,0,0,0));
  const searchEnd = new Date(targetDate.setHours(23,59,59,999));
  
  const events = [];
  if (ladyCal) events.push(...ladyCal.getEvents(searchStart, searchEnd));
  if (menCal) events.push(...menCal.getEvents(searchStart, searchEnd));
  
  const slots = [];
  let currentPos = new Date(startTime);
  
  while (currentPos.getTime() + (durationMin * 60 * 1000) <= endTime.getTime()) {
    // 1-hour buffer check
    if (currentPos.getTime() <= bufferTime.getTime()) {
      currentPos.setTime(currentPos.getTime() + (30 * 60 * 1000));
      continue;
    }
    
    const slotEnd = new Date(currentPos.getTime() + (durationMin * 60 * 1000));
    
    // Check overlap
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
    
    currentPos.setTime(currentPos.getTime() + (30 * 60 * 1000)); // 30min step
  }
  
  return slots;
}

/**
 * Finalize Booking
 */
function createBooking(details) {
  const { gender, menuName, dateStr, timeStr, durationMin, customerName } = details;
  const calId = gender === "Lady's" ? LADY_CALENDAR_ID : MEN_CALENDAR_ID;
  const cal = CalendarApp.getCalendarById(calId);
  
  const start = new Date(dateStr + ' ' + timeStr);
  const end = new Date(start.getTime() + (durationMin * 60 * 1000));
  
  // Create Calendar Event
  cal.createEvent(`[${gender}] ${customerName} - ${menuName}`, start, end);
  
  // Log to Sheet
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Reservations');
  sheet.appendRow([new Date(), dateStr, timeStr, menuName, gender, customerName]);
  
  return { success: true };
}
