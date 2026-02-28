const url = 'https://script.google.com/macros/s/AKfycbzztoKPT9b8Sjl1scy0OO18SZzSYm1uAKLFuiGUKtjZOIy8PSwKGVceYj93LOhqJvRy/exec';
const body = JSON.stringify({ action: 'getMenuData', gender: "Lady's" });

fetch(url, {
    method: 'POST',
    redirect: 'follow',
    headers: {
        'Content-Type': 'text/plain;charset=utf-8'
    },
    body: body
})
    .then(res => {
        console.log("Status:", res.status);
        console.log("Headers:");
        res.headers.forEach((v, k) => console.log(k, v));
        return res.text();
    })
    .then(text => {
        console.log("\nResponse Text:");
        console.log(text.substring(0, 1000));
    })
    .catch(err => console.error("Error:", err));
