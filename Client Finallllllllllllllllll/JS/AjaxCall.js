// =========================================
// משתנים גלובליים
// =========================================
const apiUrl = "https://localhost:7277/api/Countries";
let allCountries = [];
let alpha2ToCountry = {};
let vectorMap;

// =========================================
// אזור הרשימות האישיות של המשתמש (LocalStorage דינמי)
// =========================================
let userLists = {
    "מועדפים ❤️": [],
    "יעדים לטיסה ✈️": [],
    "הייתי שם 🌍": []
};

let currentSelectedCountryId = "";
let countryToMoveId = "";
let currentMoveList = "";

function getListStorageKey() {
    let email = sessionStorage.getItem("loggedInEmail") || "guest";
    return "userLists_" + email;
}

// פונקציה לטעינת הרשימות של המשתמש הספציפי
function loadUserLists() {
    let key = getListStorageKey();
    let savedLists = JSON.parse(localStorage.getItem(key));
    if (savedLists) {
        userLists = savedLists;
    } else {
        userLists = { "מועדפים ❤️": [], "יעדים לטיסה ✈️": [], "הייתי שם 🌍": [] };
    }
}

// פונקציה לשמירת הרשימות למשתמש הספציפי
function saveUserLists() {
    let key = getListStorageKey();
    localStorage.setItem(key, JSON.stringify(userLists));
}

// =========================================
// פונקציית עזר לקריאות שרת (AJAX)
// =========================================
function ajaxCall(method, api, data, successCB, errorCB) {
    $.ajax({
        type: method,
        url: api,
        data: data,
        cache: false,
        contentType: "application/json",
        dataType: "json",
        success: successCB,
        error: errorCB
    });
}

// =========================================
// כשהדף מוכן (האזנה לאירועים ראשיים)
// =========================================
$(document).ready(function () {

    // 1. בדיקת סטטוס התחברות
    checkLoginStatus();

    // 2. טעינת הרשימות הפרטיות של המשתמש המחובר!
    loadUserLists();

    // -- מאזינים לדף הבית (index.html) --
    $("#loadCountriesBtn").click(function () {
        loadCountries();
    });

    $(document).on("keyup", "#searchInput", applyFiltersAndSort);
    $(document).on("change", "#regionFilter, #sortBy, #currencyFilter", applyFiltersAndSort);

    // -- מאזינים להרשמה והתחברות --
    $("#loginForm").submit(function (event) { loginUser(event); });
    $("#btnRegister").click(function (event) { registerUser(event); });

    $(document).on("click", "#btnLogout", function (e) {
        e.preventDefault();
        sessionStorage.removeItem("loggedInUser");
        sessionStorage.removeItem("loggedInEmail");
        sessionStorage.clear();
        window.location.reload();
    });

    // הגנה על תיבות הסימון - עצירת הקליק אם המשתמש לא מחובר או נעול
    $(document).on('click', '.list-box input[type="checkbox"]', function (e) {
        if (!isLoggedIn()) {
            e.preventDefault(); // מונע מה-V להופיע בתיבה
            alert("עליך להתחבר לאתר תחילה כדי לנהל את הרשימות שלך.");
            return false;
        }
        if (isUserLocked()) {
            e.preventDefault();
            alert("חשבונך הוגבל. אינך מורשה לנהל רשימות.");
            return false;
        }
    });

    // טעינת מדינות בעת כניסה לדף החידונים
    if ($("#quizSelectionScreen").length > 0) {
        ajaxCall("GET", `${apiUrl}/GetAllCountries`, null, function (data) {
            allCountries = data.filter(c => c !== null);
        }, function (err) { console.error("שגיאה בטעינת מדינות לחידון"); });
    }
    // =========================================
    // טעינת דף המפה (my-lists.html) בלבד!
    // =========================================
    if ($("#world-map").length > 0) {
        initMyListsPage();
    }

    // מאזינים לשינויים ברשימות הצד של המפה
    $(document).on('change', '.list-cb', function () {
        let id = $(this).data("id");
        let listName = $(this).data("list");

        if (this.checked) {
            if (!userLists[listName].includes(id)) {
                userLists[listName].push(id);
            }
        } else {
            userLists[listName] = userLists[listName].filter(x => x !== id);
        }

        saveUserLists(); // שמירה דינמית
        updateMapColors();
    });

    // חיפוש ברשימות הצד
    $(document).on('keyup', '#mapSearch', function () {
        let text = $(this).val().toLowerCase().trim();
        $(".check-item").each(function () {
            let name = $(this).text().toLowerCase();
            if (name.includes(text)) {
                $(this).show();
            } else {
                $(this).hide();
            }
        });
    });
    // הגנת דפים למשתמשים נעולים
    if (window.location.pathname.includes("my-lists.html") || window.location.pathname.includes("quizzes.html")) {
        if (isUserLocked()) {
            alert("חשבונך הוגבל על ידי הנהלת האתר. אין לך גישה לעמוד זה.");
            window.location.href = "../index.html"; // זורק אותו חזרה לדף הבית
            return;
        }
    }
});

// =========================================
// פונקציות דף המפה (my-lists.html)
// =========================================
function initMyListsPage() {
    $.ajax({
        type: "GET",
        url: `${apiUrl}/GetAllCountries`,
        success: function (data) {
            allCountries = data.filter(c => c !== null);
            processCountriesData();
            renderSidebars();
            initMap();
        },
        error: function (err) {
            console.error("שגיאה בטעינת מדינות", err);
        }
    });
}

function processCountriesData() {
    allCountries.forEach(c => {
        let alpha2 = "";
        if (c.flagImageUrl && c.flagImageUrl.includes("/")) {
            let parts = c.flagImageUrl.split('/');
            let fileName = parts[parts.length - 1];
            alpha2 = fileName.split('.')[0].toUpperCase();
        }
        c.alpha2 = alpha2;
        if (alpha2) alpha2ToCountry[alpha2] = c;
    });
}

function renderSidebars() {
    $("#visited-list, #want-list, #favorite-list").empty();
    let sorted = [...allCountries].sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    sorted.forEach(c => {
        let checkVis = userLists["הייתי שם 🌍"].includes(c.id) ? "checked" : "";
        $("#visited-list").append(`<label class="check-item"><input type="checkbox" class="list-cb" data-id="${c.id}" data-list="הייתי שם 🌍" ${checkVis}> ${c.name}</label>`);

        let checkWant = userLists["יעדים לטיסה ✈️"].includes(c.id) ? "checked" : "";
        $("#want-list").append(`<label class="check-item"><input type="checkbox" class="list-cb" data-id="${c.id}" data-list="יעדים לטיסה ✈️" ${checkWant}> ${c.name}</label>`);

        let checkFav = userLists["מועדפים ❤️"].includes(c.id) ? "checked" : "";
        $("#favorite-list").append(`<label class="check-item"><input type="checkbox" class="list-cb" data-id="${c.id}" data-list="מועדפים ❤️" ${checkFav}> ${c.name}</label>`);
    });
}

function initMap() {
    vectorMap = new jsVectorMap({
        selector: '#world-map',
        map: 'world',
        zoomButtons: true,
        regionStyle: {
            initial: { fill: '#64748b', stroke: '#0f172a', strokeWidth: 0.5 },
            hover: { fill: '#3b82f6', fillOpacity: 0.8 }
        },
        onLoaded(map) {
            updateMapColors();
        },
        // --- יצירת החלונית האינטראקטיבית המקצועית ---
        onRegionTooltipShow(event, tooltip, code) {
            let country = alpha2ToCountry[code];
            if (country) {
                let status = "לא נשמר ברשימות";
                let statusColor = "#94a3b8";
                let icon = "";

                if (userLists["הייתי שם 🌍"].includes(country.id)) {
                    status = "הייתי שם"; statusColor = "#2ecc71"; icon = "🌍";
                } else if (userLists["יעדים לטיסה ✈️"].includes(country.id)) {
                    status = "יעד לטיסה"; statusColor = "#f39c12"; icon = "✈️";
                } else if (userLists["מועדפים ❤️"].includes(country.id)) {
                    status = "במועדפים"; statusColor = "#ef4444"; icon = "❤️";
                }

                let tooltipHtml = `
                    <div style="text-align: right; padding: 12px; min-width: 180px;">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">
                            <img src="${country.flagImageUrl}" style="width: 30px; height: 20px; object-fit: cover; border-radius: 3px;">
                            <strong style="font-size: 1.1rem;">${country.name}</strong>
                        </div>
                        <div style="font-size: 0.9rem; color: #cbd5e1; margin-bottom: 8px;">
                            <i class="fas fa-city" style="color: #94a3b8; margin-left: 5px;"></i>בירה: ${country.city || 'לא צוין'}
                        </div>
                        <div style="font-size: 0.95rem; color: ${statusColor}; font-weight: bold;">
                            ${icon} ${status}
                        </div>
                    </div>
                `;
                tooltip.html(tooltipHtml);
            } else {
                tooltip.html(`<div style="padding: 10px; text-align: center;">${tooltip.text()}<br><span style="color: #ef4444; font-size: 0.8rem;">מידע לא זמין</span></div>`);
            }
        },
        // --- לוגיקת לחיצה נקייה יותר ---
        onRegionClick: function (event, code) {
            // הברקס למשתמשים לא מחוברים
            if (!isLoggedIn()) {
                alert("עליך להתחבר לאתר תחילה כדי לסמן מדינות על המפה.");
                return;
            }
            // הברקס למשתמשים נעולים (אם כבר הוספת אותו קודם)
            if (isUserLocked()) {
                alert("חשבונך הוגבל. אינך מורשה לבצע פעולה זו.");
                return;
            }

            let country = alpha2ToCountry[code];
            if (!country) return;

            let id = country.id;
            let isVisited = userLists["הייתי שם 🌍"].includes(id);
            let isWant = userLists["יעדים לטיסה ✈️"].includes(id);
            let isFav = userLists["מועדפים ❤️"].includes(id);

            // סבב לחיצות פשוט: הייתי שם -> יעד לטיסה -> מועדף -> הסרה
            if (!isVisited && !isWant && !isFav) {
                userLists["הייתי שם 🌍"].push(id);
            } else if (isVisited) {
                userLists["הייתי שם 🌍"] = userLists["הייתי שם 🌍"].filter(x => x !== id);
                userLists["יעדים לטיסה ✈️"].push(id);
            } else if (isWant) {
                userLists["יעדים לטיסה ✈️"] = userLists["יעדים לטיסה ✈️"].filter(x => x !== id);
                userLists["מועדפים ❤️"].push(id);
            } else {
                userLists["מועדפים ❤️"] = userLists["מועדפים ❤️"].filter(x => x !== id);
            }

            saveUserLists();
            syncCheckboxes();
            updateMapColors();
        }
    });
}

function updateMapColors() {
    document.querySelectorAll('.jvm-region').forEach(path => {
        path.style.fill = '#64748b';
    });

    const colorRegions = (listName, colorCode) => {
        userLists[listName].forEach(id => {
            let c = allCountries.find(x => x.id === id);
            if (c && c.alpha2) {
                let el = document.querySelector(`.jvm-region[data-code="${c.alpha2}"]`);
                if (el) el.style.fill = colorCode;
            }
        });
    };

    colorRegions("מועדפים ❤️", '#ef4444');
    colorRegions("יעדים לטיסה ✈️", '#f39c12');
    colorRegions("הייתי שם 🌍", '#2ecc71');
}

function syncCheckboxes() {
    $(".list-cb").each(function () {
        let id = $(this).data("id");
        let list = $(this).data("list");
        $(this).prop("checked", userLists[list].includes(id));
    });
}

// =========================================
// פונקציית בדיקת מצב התחברות (UI)
// =========================================
// =========================================
// פונקציית בדיקת מצב התחברות (UI)
// =========================================
// =========================================
// פונקציית בדיקת מצב התחברות (UI)
// =========================================
// =========================================
// פונקציית בדיקת מצב התחברות (UI)
// =========================================
function checkLoginStatus() {
    let loggedInUser = sessionStorage.getItem("loggedInUser");
    let isAdmin = sessionStorage.getItem("isAdmin") === "true";

    if (loggedInUser) {
        // המשתמש מחובר
        $("#userGreetingLi").show();
        $("#userGreeting").text("שלום, " + loggedInUser);
        $("#logoutLi").show();

        // מסתיר את שני הכפתורים
        $("#loginLi").hide();
        $("#registerLi").hide();

        // בדיקת ניהול
        if (isAdmin) {
            $("#adminLinkLi").show();
        } else {
            $("#adminLinkLi").hide();
        }

    } else {
        // המשתמש לא מחובר
        $("#userGreetingLi").hide();
        $("#logoutLi").hide();
        $("#adminLinkLi").hide();

        // מציג את שני הכפתורים הרגילים!
        $("#loginLi").show();
        $("#registerLi").show();
    }
}

// =========================================
// אזור משתמשים - הרשמה והתחברות
// =========================================
function registerUser(event) {
    if (event) event.preventDefault();
    let newUser = {
        FirstName: $("#firstName").val(),
        LastName: $("#lastName").val(),
        Email: $("#email").val(),
        Password: $("#password").val(),
        FavContinent: $("#favContinent").val(),
        LanguageProficiency: $("#languageProficiency").val()
    };
    if ($("#password").val() !== $("#confirmPassword").val()) {
        alert("הסיסמאות אינן תואמות!");
        return;
    }
    ajaxCall("POST", `https://localhost:7277/api/Users/Register`, JSON.stringify(newUser), registerSuccess, registerError);
}

function registerSuccess(data) {
    alert("ההרשמה בוצעה בהצלחה!");
    window.location.href = "login.html";
}

function registerError(err) {
    alert("אירעה שגיאה בתהליך ההרשמה.");
}

function loginUser(event) {
    if (event) event.preventDefault();
    let loginData = { Email: $("#email").val(), Password: $("#password").val() };
    ajaxCall("POST", `https://localhost:7277/api/Users/Login`, JSON.stringify(loginData), loginSuccess, loginError);
}

function loginSuccess(data) {
    alert("התחברת בהצלחה!");
    let fName = data.user.FirstName || data.user.firstName || "";
    let lName = data.user.LastName || data.user.lastName || "";
    let fullName = (fName + " " + lName).trim();
    if (!fullName) fullName = "משתמש";

    sessionStorage.setItem("loggedInUser", fullName);
    sessionStorage.setItem("loggedInEmail", data.user.Email || data.user.email);
    sessionStorage.setItem("isAdmin", data.user.IsAdmin !== undefined ? data.user.IsAdmin : data.user.isAdmin);
    sessionStorage.setItem("isMaster", data.user.IsMaster !== undefined ? data.user.IsMaster : data.user.isMaster);

    // שומרים את מצב הנעילה בזיכרון!
    let isLocked = data.user.IsLocked !== undefined ? data.user.IsLocked : data.user.isLocked;
    sessionStorage.setItem("isLocked", isLocked);

    window.location.href = "../index.html";
}

// פונקציית עזר חכמה שבודקת אם המשתמש מוגבל
// פונקציית עזר לבדיקה אם יש משתמש מחובר כרגע
function isLoggedIn() {
    let email = sessionStorage.getItem("loggedInEmail");
    return email !== null && email !== "";
}
function isUserLocked() {
    return sessionStorage.getItem("isLocked") === "true";
}

function loginError(err) {
    if (err.responseText) {
        alert(err.responseText); // יציג "החשבון ננעל" אם השרת חסם
    } else {
        alert("שגיאה בהתחברות: בדוק את המייל והסיסמה.");
    }
}

// =========================================
// דף הבית (index.html) - מדינות ורשימות קופצות
// =========================================
function loadCountries() {
    ajaxCall("GET", `${apiUrl}/GetAllCountries`, null, getCountriesSuccess, getCountriesError);
}

function getCountriesSuccess(countries) {
    allCountries = countries.filter(c => c !== null);
    populateCurrencyDropdown();
    renderCountries(allCountries);
}

function getCountriesError(err) {
    alert("שגיאה בטעינת המדינות מהשרת");
}

function renderCountries(countriesToRender) {
    const grid = $(".countries-grid");
    grid.empty();

    for (let i = 0; i < countriesToRender.length; i++) {
        let country = countriesToRender[i];
        let displayImage = (country.flagImageUrl && country.flagImageUrl.startsWith("http")) ? country.flagImageUrl : "https://placehold.co/320x180/0f172a/ffffff?text=No+Flag";
        let safeName = country.name ? country.name.replace(/'/g, "\\'") : "";

        let cardHtml = `
            <div class="country-card fade-in-up">
                <div class="card-img-placeholder" style="background-image: url('${displayImage}');"></div>
                <div class="card-content">
                    <h3 class="card-title">${country.name}</h3>
                    <div class="card-info"><span><i class="fas fa-map-marker-alt"></i> אזור:</span> <span>${country.region}</span></div>
                    <div class="card-info"><span><i class="fas fa-city"></i> עיר בירה:</span> <span>${country.city || 'לא צוין'}</span></div>
                    <div class="card-info"><span><i class="fas fa-users"></i> אוכלוסייה:</span> <span>${(country.population || 0).toLocaleString()}</span></div>
                </div>
                
                <div class="card-actions" style="display: flex; gap: 8px; align-items: center; padding: 15px;">
                    <button class="btn" onclick="openDetailsModal('${country.id}')" style="padding: 8px; font-size: 0.85rem; flex-grow: 1;">פרטים</button>
                    <button class="btn" onclick="openSharesModal('${country.id}', '${safeName}')" style="padding: 8px; font-size: 0.85rem; background: rgba(59, 130, 246, 0.2); border-color: #3b82f6; flex-grow: 1;">קהילה</button>
                    <button class="btn" onclick="openSaveModal('${country.id}')" title="הוסף לרשימה" style="padding: 8px 12px; font-size: 0.9rem; background: transparent; border-color: white;">
                        <i class="far fa-heart"></i>
                    </button>
                </div>
            </div>
        `;
        grid.append(cardHtml);
    }
}

function applyFiltersAndSort() {
    let searchText = $("#searchInput").val() ? $("#searchInput").val().toLowerCase().trim() : "";
    let selectedRegion = $("#regionFilter").val() ? $("#regionFilter").val() : "";
    let selectedCurrency = $("#currencyFilter").val() ? $("#currencyFilter").val().toLowerCase().trim() : "";
    let sortBy = $("#sortBy").val() ? $("#sortBy").val() : "";

    let filteredCountries = allCountries.filter(c => {
        let name = c.name ? String(c.name).toLowerCase() : "";
        let lang = c.language ? String(c.language).toLowerCase() : "";
        let curr = c.currency ? String(c.currency).toLowerCase().trim() : "";
        let region = c.region ? String(c.region) : "";

        let matchSearch = (searchText === "") || name.includes(searchText) || lang.includes(searchText) || curr.includes(searchText);
        let matchRegion = (selectedRegion === "") || (region === selectedRegion);
        let matchCurrency = (selectedCurrency === "") || (curr === selectedCurrency);

        return matchSearch && matchRegion && matchCurrency;
    });

    if (sortBy === "name_asc") {
        filteredCountries.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    } else if (sortBy === "name_desc") {
        filteredCountries.sort((a, b) => String(b.name || "").localeCompare(String(a.name || "")));
    } else if (sortBy === "pop_desc") {
        filteredCountries.sort((a, b) => (b.population || 0) - (a.population || 0));
    } else if (sortBy === "pop_asc") {
        filteredCountries.sort((a, b) => (a.population || 0) - (b.population || 0));
    } else if (sortBy === "area_desc") {
        filteredCountries.sort((a, b) => (b.area || 0) - (a.area || 0));
    }

    renderCountries(filteredCountries);
}

function populateCurrencyDropdown() {
    let uniqueCurrencies = new Set();
    allCountries.forEach(c => {
        if (c.currency && String(c.currency).trim() !== "") uniqueCurrencies.add(String(c.currency).trim());
    });

    let sortedCurrencies = Array.from(uniqueCurrencies).sort();
    let dropdown = $("#currencyFilter");
    dropdown.find("option:not(:first)").remove();

    sortedCurrencies.forEach(curr => {
        dropdown.append(`<option value="${curr.toLowerCase()}">${curr}</option>`);
    });
}

function openSaveModal(countryId) {
    if (!isLoggedIn()) {
        alert("עליך להתחבר לאתר תחילה כדי לשמור מדינות.");
        return;
    }
    if (isUserLocked()) {
        alert("חשבונך הוגבל. אינך מורשה לשמור מדינות לרשימות.");
        return;
    }
    currentSelectedCountryId = countryId;
    $("#saveModal").fadeIn();
}

function closeSaveModal() {
    $("#saveModal").fadeOut();
}

function confirmSaveToList() {
    let selectedList = $("#listSelector").val();
    if (userLists[selectedList].includes(currentSelectedCountryId)) {
        alert("המדינה כבר שמורה ברשימה זו!");
    } else {
        userLists[selectedList].push(currentSelectedCountryId);
        saveUserLists(); // שמירה דינמית
        alert("נשמר בהצלחה!");
    }
    closeSaveModal();
}

function toggleMyLists() {
    let listsScreen = $("#myListsScreen");
    if (listsScreen.is(":visible")) {
        listsScreen.hide();
        $(".filters-container, .countries-grid").fadeIn();
    } else {
        $(".filters-container, .countries-grid").hide();
        listsScreen.fadeIn();
        renderLists();
    }
}

function renderLists() {
    let container = $("#listsContainer");
    container.empty();

    for (let listName in userLists) {
        let listHtml = `
            <div class="popup-list-box">
                <h3>${listName}</h3>
                <ul class="popup-list-items">
        `;

        if (userLists[listName].length === 0) {
            listHtml += `<li style="text-align: center; color: #94a3b8; margin-top: 20px;">הרשימה ריקה</li>`;
        } else {
            userLists[listName].forEach(countryId => {
                let c = allCountries.find(x => x.id === countryId);
                if (c) {
                    listHtml += `
                        <li class="popup-list-item">
                            <span>${c.name}</span>
                            <div>
                                <button onclick="openMoveModal('${countryId}', '${listName}')" title="העבר לרשימה אחרת" style="background: none; border: none; cursor: pointer; color: #60a5fa; margin-left: 5px;"><i class="fas fa-exchange-alt"></i></button>
                                <button onclick="removeFromList('${countryId}', '${listName}')" title="הסר" style="background: none; border: none; cursor: pointer; color: #f87171;"><i class="fas fa-trash"></i></button>
                            </div>
                        </li>
                    `;
                }
            });
        }
        listHtml += `</ul></div>`;
        container.append(listHtml);
    }
}

function removeFromList(countryId, listName) {
    if (confirm("האם אתה בטוח שברצונך להסיר את המדינה מהרשימה?")) {
        userLists[listName] = userLists[listName].filter(id => id !== countryId);
        saveUserLists(); // שמירה דינמית
        renderLists();
    }
}

function openMoveModal(countryId, currentList) {
    countryToMoveId = countryId;
    currentMoveList = currentList;
    let moveSelector = $("#moveSelector");
    moveSelector.empty();

    for (let listName in userLists) {
        if (listName !== currentList) {
            moveSelector.append(`<option value="${listName}">${listName}</option>`);
        }
    }
    $("#moveModal").fadeIn();
}

function closeMoveModal() {
    $("#moveModal").fadeOut();
}

function confirmMove() {
    let targetList = $("#moveSelector").val();
    userLists[currentMoveList] = userLists[currentMoveList].filter(id => id !== countryToMoveId);
    if (!userLists[targetList].includes(countryToMoveId)) {
        userLists[targetList].push(countryToMoveId);
    }
    saveUserLists(); // שמירה דינמית
    closeMoveModal();
    renderLists();
}

// =========================================
// מערכת שיתופים וקהילה (Shares CRUD)
// =========================================
let currentSharesCountryId = "";

function openSharesModal(countryId, countryName) {
    currentSharesCountryId = countryId;
    $("#modalCountryTitle").text(`שיתופי קהילה - ${countryName}`);
    $("#countrySharesModal").fadeIn();

    let loggedInEmail = sessionStorage.getItem("loggedInEmail");

    if (loggedInEmail && loggedInEmail !== "undefined" && loggedInEmail !== "null" && loggedInEmail.trim() !== "") {
        $("#addShareSection").show();
        $("#loginToShareMsg").hide();
    } else {
        $("#addShareSection").hide();
        $("#loginToShareMsg").show();
    }

    loadShares();
}

function closeSharesModal() {
    $("#countrySharesModal").fadeOut();
    $("#shareContent").val("");
}

function loadShares() {
    ajaxCall("GET", `https://localhost:7277/api/Shares/GetByCountry/${currentSharesCountryId}`, null, renderShares, renderSharesError);
}

function renderShares(sharesList) {
    let container = $("#sharesList");
    container.empty();

    if (!sharesList || sharesList.length === 0) {
        container.append(`<p style="text-align: center; color: #94a3b8; margin-top: 40px;">עדיין אין שיתופים למדינה זו. היה הראשון לשתף!</p>`);
        return;
    }

    let currentUserEmail = sessionStorage.getItem("loggedInEmail");

    sharesList.forEach(share => {
        let actionsHtml = "";
        if (currentUserEmail && currentUserEmail === share.userEmail) {
            actionsHtml = `
                <div class="share-actions">
                    <button class="btn-edit" onclick="editShare(${share.id}, '${share.content.replace(/'/g, "\\'")}')"><i class="fas fa-edit"></i> ערוך</button>
                    <button class="btn-delete" onclick="deleteShare(${share.id})"><i class="fas fa-trash"></i> מחק</button>
                </div>
            `;
        }

        let shareHtml = `
            <div class="share-card">
                <div class="share-header">
                    <span><i class="fas fa-user-circle"></i> ${share.userName}</span>
                    <span>${new Date(share.datePosted).toLocaleDateString("he-IL")}</span>
                </div>
                <div class="share-content">${share.content}</div>
                ${actionsHtml}
            </div>
        `;
        container.append(shareHtml);
    });
}

function renderSharesError(err) {
    $("#sharesList").html(`<p style="text-align: center; color: #ef4444;">אירעה שגיאה בטעינת השיתופים.</p>`);
}

function postShare() {
    if (isUserLocked()) {
        alert("חשבונך הוגבל. אינך מורשה לפרסם שיתופים.");
        return;
    }
    let content = $("#shareContent").val().trim();
    if (content === "") {
        alert("לא ניתן לפרסם שיתוף ריק.");
        return;
    }

    let userEmail = sessionStorage.getItem("loggedInEmail");
    let userName = sessionStorage.getItem("loggedInUser");

    if (!userEmail || userEmail === "undefined" || !userName || userName === "undefined") {
        alert("שגיאת הרשאות: עליך להתחבר מחדש.");
        return;
    }

    let newShare = {
        CountryId: currentSharesCountryId,
        UserEmail: userEmail,
        UserName: userName,
        Content: content
    };

    $.ajax({
        type: "POST",
        url: `https://localhost:7277/api/Shares/AddShare`,
        data: JSON.stringify(newShare),
        contentType: "application/json",
        success: function () {
            $("#shareContent").val("");
            loadShares();
        },
        error: function (err) {
            console.error("Server Error:", err);
            alert("שגיאה בפרסום השיתוף.");
        }
    });
}

function deleteShare(shareId) {
    if (isUserLocked()) {
        alert("חשבונך הוגבל. אינך מורשה למחוק שיתופים.");
        return;
    }
    if (confirm("האם אתה בטוח שברצונך למחוק את השיתוף?")) {
        $.ajax({
            type: "DELETE",
            url: `https://localhost:7277/api/Shares/DeleteShare/${shareId}`,
            success: function () { loadShares(); },
            error: function () { alert("שגיאה במחיקת השיתוף."); }
        });
    }
}

function editShare(shareId, currentContent) {
    if (isUserLocked()) {
        alert("חשבונך הוגבל. אינך מורשה לערוך שיתופים.");
        return;
    }
    let newContent = prompt("ערוך את השיתוף שלך:", currentContent);
    if (newContent !== null && newContent.trim() !== "" && newContent !== currentContent) {
        let updatedShare = { Id: shareId, Content: newContent.trim() };

        $.ajax({
            type: "PUT",
            url: `https://localhost:7277/api/Shares/UpdateShare`,
            data: JSON.stringify(updatedShare),
            contentType: "application/json",
            success: function () {
                loadShares();
            },
            error: function (err) {
                console.error("Server Error:", err);
                alert("שגיאה בעדכון השיתוף.");
            }
        });
    }
}

// =========================================
// מנוע מערכת החידונים מוגבלי זמן (quizzes.html)
// =========================================
let currentQuizType = "";
let quizTimer;
let timeLeft = 60;
let score = 0;
let currentCorrectAnswer = "";

function initQuiz(type) {
    if (allCountries.length === 0) {
        alert("המתן שנייה לטעינת נתוני המדינות...");
        return;
    }

    let userEmail = sessionStorage.getItem("loggedInEmail");
    if (!userEmail) {
        alert("עליך להתחבר למערכת כדי לשחק ולצבור נקודות!");
        window.location.href = "login.html";
        return;
    }

    currentQuizType = type;
    score = 0;
    timeLeft = 60;

    $("#quizSelectionScreen").hide();
    $("#quizResultScreen").hide();
    $("#activeQuizScreen").fadeIn();

    $("#timeRemaining").text(timeLeft);
    $("#quizTitle").text(type === 'capitals' ? "חידון ערי בירה" : "אתגר הדגלים");

    generateQuestion();

    // הפעלת שעון העצר (טיימר) שיורד כל שנייה
    quizTimer = setInterval(function () {
        timeLeft--;
        $("#timeRemaining").text(timeLeft);
        if (timeLeft <= 0) {
            endQuiz();
        }
    }, 1000);
}

function generateQuestion() {
    // שלוף 4 מדינות רנדומליות
    let shuffledCountries = [...allCountries].sort(() => 0.5 - Math.random());
    let options = shuffledCountries.slice(0, 4);
    let correctCountry = options[Math.floor(Math.random() * 4)]; // בחירת התשובה הנכונה

    let questionHtml = "";
    $("#optionsContainer").empty();

    if (currentQuizType === 'capitals') {
        // נוודא שלמדינה שנבחרה אכן יש עיר בירה
        if (!correctCountry.city || correctCountry.city.trim() === "") {
            generateQuestion(); // הגרל מחדש אם אין בירה
            return;
        }
        currentCorrectAnswer = correctCountry.city;
        questionHtml = `<h3 style="font-size: 1.8rem; margin-bottom: 30px;">מהי עיר הבירה של <span style="color: #3b82f6;">${correctCountry.name}</span>?</h3>`;

        options.forEach(opt => {
            let cityName = opt.city && opt.city.trim() !== "" ? opt.city : "לא ידוע";
            $("#optionsContainer").append(`<button class="quiz-option-btn" onclick="checkAnswer(this, '${cityName}')">${cityName}</button>`);
        });

    } else if (currentQuizType === 'flags') {
        // נוודא שיש תמונת דגל תקינה
        if (!correctCountry.flagImageUrl || !correctCountry.flagImageUrl.startsWith("http")) {
            generateQuestion();
            return;
        }
        currentCorrectAnswer = correctCountry.name;
        questionHtml = `
            <h3 style="font-size: 1.8rem; margin-bottom: 10px;">של איזה מדינה הדגל הבא?</h3>
            <img src="${correctCountry.flagImageUrl}" class="quiz-flag-img" alt="Flag">
        `;

        options.forEach(opt => {
            $("#optionsContainer").append(`<button class="quiz-option-btn" onclick="checkAnswer(this, '${opt.name.replace(/'/g, "\\'")}')">${opt.name}</button>`);
        });
    }

    $("#questionContainer").html(questionHtml);
}

function checkAnswer(btnElement, selectedAnswer) {
    // נטרול לחיצות כפולות
    $(".quiz-option-btn").prop("disabled", true);

    if (selectedAnswer === currentCorrectAnswer) {
        $(btnElement).addClass("correct");
        score++;
    } else {
        $(btnElement).addClass("wrong");
        // צביעת התשובה הנכונה בירוק כדי שהמשתמש ילמד
        $(".quiz-option-btn").each(function () {
            if ($(this).text() === currentCorrectAnswer) $(this).addClass("correct");
        });
    }

    // המתנה של שנייה ומעבר לשאלה הבאה (כל עוד נשאר זמן)
    setTimeout(() => {
        if (timeLeft > 0) {
            generateQuestion();
        }
    }, 1000);
}

function endQuiz() {
    clearInterval(quizTimer); // עצירת הטיימר
    $("#activeQuizScreen").hide();

    let userEmail = sessionStorage.getItem("loggedInEmail");
    let earnedPoints = score * 10; // 10 נקודות לכל תשובה נכונה

    $("#finalScore").text(score);

    if (score > 0) {
        $("#pointsMessage").text(`כל הכבוד! הרווחת ${earnedPoints} נקודות פרופיל.`);
        // כאן הקריאה לשרת לעדכון הנקודות!
        updateUserPointsInDB(userEmail, earnedPoints);
    } else {
        $("#pointsMessage").text("לא נורא, נסה שוב כדי לצבור נקודות!");
    }

    $("#quizResultScreen").fadeIn();
}

function backToQuizSelection() {
    $("#quizResultScreen").hide();
    $("#quizSelectionScreen").fadeIn();
}

// קריאה לשרת לעדכון הנקודות (צד לקוח)
function updateUserPointsInDB(email, pointsToAdd) {
    let requestData = { Email: email, PointsToAdd: pointsToAdd };

    $.ajax({
        type: "PUT",
        url: `https://localhost:7277/api/Users/AddPoints`,
        data: JSON.stringify(requestData),
        contentType: "application/json",
        success: function () {
            console.log("הנקודות עודכנו בהצלחה בשרת.");
        },
        error: function (err) {
            console.error("שגיאה בעדכון נקודות:", err);
        }
    });
}

// =========================================
// אבטחה ולוגיקה - פאנל מנהל
// =========================================
$(document).ready(function () {
    // הגנת דף מנהל - אם מישהו מנסה להיכנס לדף והוא לא מנהל - נזרוק אותו הביתה!
    if (window.location.pathname.includes("admin.html")) {
        if (sessionStorage.getItem("isAdmin") !== "true") {
            alert("אין לך הרשאת גישה לדף זה!");
            window.location.href = "../index.html";
        } else {
            loadAdminStats();
            loadAdminUsers();
        }
    }
});

function loadAdminStats() {
    ajaxCall("GET", `https://localhost:7277/api/Admin/GetStats`, null, function (data) {
        $("#statLogins").text(data.dailyLogins);
        $("#statCountries").text(data.totalCountries);
        $("#statShares").text(data.totalShares);

        // חישוב המדינות שנשמרו ב-LocalStorage (כפי שביקשו) מכל המשתמשים שהתחברו לדפדפן זה
        let totalSavedLocal = 0;
        for (let i = 0; i < localStorage.length; i++) {
            let key = localStorage.key(i);
            if (key.startsWith("userLists_")) {
                let lists = JSON.parse(localStorage.getItem(key));
                totalSavedLocal += lists["מועדפים ❤️"].length + lists["יעדים לטיסה ✈️"].length + lists["הייתי שם 🌍"].length;
            }
        }
        $("#statSaved").text(totalSavedLocal);

    }, function (err) { console.error("שגיאה בטעינת סטטיסטיקות", err); });
}

function loadAdminUsers() {
    ajaxCall("GET", `https://localhost:7277/api/Admin/GetUsers`, null, function (users) {
        let tbody = $("#adminUsersList");
        tbody.empty();

        let currentUserIsMaster = sessionStorage.getItem("isMaster") === "true";
        let currentUserIsAdmin = sessionStorage.getItem("isAdmin") === "true";

        users.forEach(u => {
            let fName = u.FirstName || u.firstName || "לא ידוע";
            let lName = u.LastName || u.lastName || "";
            let email = u.Email || u.email || "לא ידוע";
            let u_isAdmin = u.IsAdmin !== undefined ? u.IsAdmin : u.isAdmin;
            let u_isLocked = u.IsLocked !== undefined ? u.IsLocked : u.isLocked;
            let u_isMaster = u.IsMaster !== undefined ? u.IsMaster : u.isMaster;

            let role = u_isMaster ? '<span style="color:#a855f7;"><i class="fas fa-gem"></i> מאסטר</span>'
                : u_isAdmin ? '<span style="color:#f59e0b;"><i class="fas fa-crown"></i> מנהל</span>'
                    : 'משתמש רגיל';

            let lockStatus = u_isLocked ? '<span style="color:#ef4444;">נעול <i class="fas fa-lock"></i></span>' : '<span style="color:#2ecc71;">פעיל <i class="fas fa-lock-open"></i></span>';

            let actionBtn = "";
            let adminBtn = "";

            if (u_isMaster) {
                // מאסטר חסין מהכל
                actionBtn = `<span style="color:#94a3b8;">חסין מנעילה</span>`;
                adminBtn = `<span style="color:#94a3b8;">-</span>`;
            } else if (currentUserIsMaster) {
                // למאסטר המחובר מותר לעשות הכל על כולם
                actionBtn = u_isLocked ? `<button class="btn-unlock" onclick="toggleLock('${email}', false)">שחרר נעילה</button>`
                    : `<button class="btn-lock" onclick="toggleLock('${email}', true)">נעל משתמש</button>`;
                adminBtn = u_isAdmin ? `<button class="btn-demote" onclick="toggleAdmin('${email}', false)">הסר ניהול</button>`
                    : `<button class="btn-promote" onclick="toggleAdmin('${email}', true)">מנהל חדש</button>`;
            } else if (currentUserIsAdmin) {
                // מנהל רגיל המחובר מסתכל על משתמשים אחרים
                if (u_isAdmin) {
                    // מנהל לא נוגע במנהל אחר
                    actionBtn = `<span style="color:#94a3b8;">אין הרשאה</span>`;
                    adminBtn = `<span style="color:#94a3b8;">אין הרשאה</span>`;
                } else {
                    // מנהל יכול לנעול משתמש רגיל, אבל לא יכול לקדם אותו
                    actionBtn = u_isLocked ? `<button class="btn-unlock" onclick="toggleLock('${email}', false)">שחרר נעילה</button>`
                        : `<button class="btn-lock" onclick="toggleLock('${email}', true)">נעל משתמש</button>`;
                    adminBtn = `<span style="color:#94a3b8;">מאסטר בלבד</span>`;
                }
            }

            let row = `
                <tr>
                    <td>${fName} ${lName}</td>
                    <td>${email}</td>
                    <td>${role}</td>
                    <td>${lockStatus}</td>
                    <td>${adminBtn}</td>
                    <td>${actionBtn}</td>
                </tr>
            `;
            tbody.append(row);
        });
    }, function (err) { console.error("שגיאה בטעינת משתמשים", err); });
}

// פונקציה חדשה לניהול סטטוס מנהל מהטבלה
// פונקציה לניהול סטטוס מנהל מהטבלה
function toggleAdmin(email, isAdminState) {
    let actionText = isAdminState ? 'להפוך משתמש זה למנהל' : 'להסיר הרשאות ניהול ממשתמש זה';
    if (confirm(`האם אתה בטוח שברצונך ${actionText}?`)) {

        let safeEmail = encodeURIComponent(email); // הגנה על כתובת המייל ב-URL

        $.ajax({
            type: "PUT",
            url: `https://localhost:7277/api/Admin/ToggleAdmin/${safeEmail}/${isAdminState}`,
            success: function () {
                loadAdminUsers();
            },
            error: function (err) {
                console.error("Server Error details:", err);
                alert("שגיאה משרת C#: " + (err.responseText || "לא ניתן היה לבצע את הפעולה."));
            }
        });
    }
}

// שדרוג אותה הגנה גם לפונקציית הנעילה ליתר ביטחון
function toggleLock(email, lockState) {
    if (confirm(`האם אתה בטוח שברצונך ${lockState ? 'לנעול' : 'לשחרר'} משתמש זה?`)) {

        let safeEmail = encodeURIComponent(email);

        $.ajax({
            type: "PUT",
            url: `https://localhost:7277/api/Admin/ToggleLock/${safeEmail}/${lockState}`,
            success: function () {
                loadAdminUsers();
            },
            error: function (err) {
                console.error("Server Error details:", err);
                alert("שגיאה משרת C#: " + (err.responseText || "לא ניתן היה לבצע את הפעולה."));
            }
        });
    }
}

// =========================================
// מודל פרטים מורחבים על מדינה
// =========================================
function openDetailsModal(countryId) {
    let country = allCountries.find(c => String(c.id) === String(countryId));
    if (!country) return;

    let displayImage = (country.flagImageUrl && country.flagImageUrl.startsWith("http")) ? country.flagImageUrl : "[https://placehold.co/320x180/0f172a/ffffff?text=No+Flag](https://placehold.co/320x180/0f172a/ffffff?text=No+Flag)";

    let detailsHtml = `
        <div style="text-align: center; margin-bottom: 25px;">
            <img src="${displayImage}" alt="Flag" style="max-width: 250px; border-radius: 10px; box-shadow: 0 5px 15px rgba(0,0,0,0.5);">
            <h2 style="color: white; font-size: 2.2rem; margin: 15px 0 5px 0;">${country.name}</h2>
        </div>
        
        <div class="details-grid-modal">
            <div class="detail-item"><i class="fas fa-map-marker-alt" style="color: #3b82f6;"></i> <strong>אזור יבשת:</strong> ${country.region || 'לא צוין'}</div>
            <div class="detail-item"><i class="fas fa-city" style="color: #10b981;"></i> <strong>עיר בירה:</strong> ${country.city || 'לא צוין'}</div>
            <div class="detail-item"><i class="fas fa-users" style="color: #f59e0b;"></i> <strong>אוכלוסייה:</strong> ${(country.population || 0).toLocaleString()} תושבים</div>
            <div class="detail-item"><i class="fas fa-ruler-combined" style="color: #8b5cf6;"></i> <strong>שטח:</strong> ${(country.area || 0).toLocaleString()} קמ"ר</div>
            <div class="detail-item"><i class="fas fa-money-bill-wave" style="color: #2ecc71;"></i> <strong>מטבע:</strong> ${country.currency || 'לא צוין'}</div>
            <div class="detail-item"><i class="fas fa-language" style="color: #ef4444;"></i> <strong>שפה עיקרית:</strong> ${country.language || 'לא צוין'}</div>
        </div>

       <!-- אזור ה-AI החדש - צ'אט מותאם אישית -->
        <div style="margin-top: 30px; text-align: right; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 20px;">
            <h3 style="color: #a78bfa; margin-bottom: 15px; font-size: 1.3rem;"><i class="fas fa-robot"></i> תכנון טיול אישי עם AI</h3>

            <textarea id="aiUserInput" rows="3" placeholder="לדוגמה: אנחנו 10 חברים, מחפשים מסלול של 6 ימים שכולל השכרת רכבים ולינה בבקתת עץ עם מנגל בחוץ..." style="width: 100%; padding: 12px; border-radius: 8px; background: rgba(0,0,0,0.3); color: white; border: 1px solid #8b5cf6; margin-bottom: 15px; font-family: inherit; resize: vertical;"></textarea>

            <div style="text-align: left;">
                <button id="btnAiItinerary" class="btn" onclick="generateAIItinerary('${country.name.replace(/'/g, "\\'")}')" style="background: linear-gradient(45deg, #8b5cf6, #3b82f6); border: none; padding: 10px 20px; font-size: 1rem; box-shadow: 0 4px 15px rgba(139, 92, 246, 0.4);">
                    <i class="fas fa-paper-plane"></i> שאל את ה-AI
                </button>
            </div>
            
            <div id="aiLoading" style="display: none; margin-top: 20px; color: #a78bfa; text-align: center;">
                <i class="fas fa-circle-notch fa-spin fa-2x"></i>
                <p style="margin-top: 10px;">הבינה המלאכותית חושבת על זה...</p>
            </div>

            <div id="aiResultBox" style="display: none; margin-top: 20px; text-align: right; background: rgba(15, 23, 42, 0.8); padding: 20px; border-radius: 10px; border: 1px solid #8b5cf6; color: #e2e8f0;">
                 <!-- התוצאה תוזרק לכאן -->
            </div>
        </div>
    `;

    $("#detailsModalBody").html(detailsHtml);
    $("#detailsModal").fadeIn();
}

// פונקציית הקריאה לשרת ה-AI
function generateAIItinerary(countryName) {
    if (!isLoggedIn()) {
        alert("רק משתמשים מחוברים יכולים להשתמש בסוכן הנסיעות החכם. אנא התחבר תחילה.");
        return;
    }
    let userMsg = $("#aiUserInput").val();

    // נוודא שהמשתמש באמת כתב משהו
    if (!userMsg || userMsg.trim() === "") {
        alert("אנא כתוב בקשה או שאלה לבינה המלאכותית לפני השליחה.");
        return;
    }

    $("#btnAiItinerary").hide();
    $("#aiResultBox").hide();
    $("#aiLoading").fadeIn();

    // מכינים את האובייקט לשליחה לשרת (תואם למחלקת AiRequest ב-C#)
    let requestData = {
        CountryName: countryName,
        UserPrompt: userMsg
    };

    $.ajax({
        type: "POST", // שינינו ל-POST!
        url: `https://localhost:7277/api/AI/AskAI`,
        contentType: "application/json",
        data: JSON.stringify(requestData),
        success: function (data) {
            $("#aiLoading").hide();
            $("#btnAiItinerary").show();
            // מרוקנים את תיבת הטקסט לטובת השאלה הבאה
            $("#aiUserInput").val("");
            $("#aiResultBox").html(data.itinerary).fadeIn();
        },
        error: function (err) {
            $("#aiLoading").hide();
            $("#btnAiItinerary").show();
            let serverError = err.responseText ? err.responseText : "לא ניתן להתחבר לשרת ה-C#";
            alert("תקלת שרת: " + serverError);
            console.error("פרטי השגיאה:", err);
        }
    });
}

function closeDetailsModal() {
    $("#detailsModal").fadeOut();
}

// =========================================
// מנגנון העלמת מסך הטעינה (Preloader)
// =========================================
$(window).on('load', function () {
    // הוספנו השהייה קלה של 800 אלפיות השנייה (קצת פחות משנייה)
    // כדי לתת לשרת לסיים לשלוף את המדינות, וכדי שנספיק לראות את האפקט
    setTimeout(function () {
        $("#preloader").fadeOut(600, function () {
            // אחרי שהמסך התפוגג, נסיר אותו לגמרי מה-DOM כדי שלא יפריע ללחיצות
            $(this).remove();
        });
    }, 800);
});
// =========================================
// מנוע כדור ארץ תלת-ממדי כרקע כללי (Globe.gl)
// =========================================
document.addEventListener("DOMContentLoaded", function () {
    const container = document.getElementById('globeBackground');
    if (!container) return;

    // נקודות ציון גלובליות שיופיעו על כדור הארץ ברקע
    const globalPoints = [
        { lat: 32.0853, lng: 34.7818, name: "תל אביב (הבסיס שלנו)", color: "#2ecc71", size: 1.5 },
        { lat: 44.4268, lng: 26.1025, name: "בוקרשט", color: "#f39c12", size: 1.2 },
        { lat: 35.6762, lng: 139.6503, name: "טוקיו", color: "#ef4444", size: 1.5 },
        { lat: 31.2304, lng: 121.4737, name: "שנגחאי", color: "#3b82f6", size: 1.2 },
        { lat: 51.5074, lng: -0.1278, name: "לונדון", color: "#a855f7", size: 1.2 }
    ];

    // יצירת הכדור על כל מסך החלון
    // יצירת הכדור על כל מסך החלון
    const World = Globe()
        (container)
        .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-night.jpg') // מפת לילה מוארת
        .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')   // טופוגרפיה
        .backgroundImageUrl('https://unpkg.com/three-globe/example/img/night-sky.png') // <--- הוספנו את תמונת החלל המובנית של הספרייה
        .pointsData(globalPoints)
        .pointLat('lat')
        .pointLng('lng')
        .pointColor('color')
        .pointAltitude(0.01)
        .pointRadius(d => d.size)
        .pointLabel('name');

    // התאמה ראשונית לגודל המסך
    World.width(window.innerWidth);
    World.height(window.innerHeight);

    // עדכון אוטומטי אם משנים את גודל חלון הדפדפן
    window.addEventListener('resize', () => {
        World.width(window.innerWidth);
        World.height(window.innerHeight);
    });

    // סיבוב אוטומטי איטי ויוקרתי ברקע
    World.controls().autoRotate = true;
    World.controls().autoRotateSpeed = 0.4;

    // זווית התחלתית מרכזית לכיוון אזור המזרח התיכון/אירופה
    World.pointOfView({ lat: 25, lng: 35, altitude: 2.3 });
});
