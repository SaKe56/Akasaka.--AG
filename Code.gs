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
    
    // MimeType.TEXT を使用して文字列として返却し、ブラウザの不要なJSONP解釈を回避
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
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Menus');
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();
  
  return data
    .filter(row => row[1] === gender)
    .map((row, index) => {
      let obj = {};
      headers.forEach((header, i) => {
        obj[header] = row[i] instanceof Date ? row[i].toISOString() : row[i];
      });
      obj.rowId = index + 2; 
      return obj;
    });
}

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

function getAvailableSlots(dateStr, durationMin) {
  const targetDate = new Date(dateStr);
  const startTime = new Date(targetDate.setHours(10, 0, 0, 0)); 
  const endTime = new Date(targetDate.setHours(20, 0, 0, 0));   
  
  const now = new Date();
  const bufferTime = new Date(now.getTime() + (60 * 60 * 1000)); 
  
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
  const calId = gender === "Lady's" ? LADY_CALENDAR_ID : MEN_CALENDAR_ID;
  const cal = CalendarApp.getCalendarById(calId);
  
  const start = new Date(dateStr + ' ' + timeStr);
  const end = new Date(start.getTime() + (durationMin * 60 * 1000));
  
  cal.createEvent(`[${gender}] ${customerName} - ${menuName}`, start, end);
  
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Reservations');
  sheet.appendRow([new Date(), dateStr, timeStr, menuName, gender, customerName]);
  
  return { success: true };
}
