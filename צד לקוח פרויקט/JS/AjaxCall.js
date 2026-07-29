const BASE_API_URL = "https://proj.ruppin.ac.il/cgroup29/test2/tar1/api/";
const apiUrl = "https://localhost:7234/api/Countries";
let allCountries = [];
let alpha2ToCountry = {};
let vectorMap;


let userLists = {
    "מועדפים ❤️": [],
    "יעדים לטיסה ✈️": [],
    "הייתי שם 🌍": []
};

let currentSelectedCountryId = "";
let countryToMoveId = "";
let currentMoveList = "";

function loadUserLists() {
    let email = sessionStorage.getItem("loggedInEmail");

    if (!email) {
        userLists = { "מועדפים ❤️": [], "יעדים לטיסה ✈️": [], "הייתי שם 🌍": [] };
        return;
    }

    $.ajax({
        type: "GET",
        url: `${BASE_API_URL}Users/GetUserLists/${encodeURIComponent(email)}`,
        success: function (data) {
            userLists = data;
            console.log("רשימות נטענו מהשרת בהצלחה!");

            if (typeof syncCheckboxes === "function") syncCheckboxes();
            if (typeof updateMapColors === "function") updateMapColors();
        },
        error: function (err) {
            console.error("שגיאה במשיכת רשימות המשתמש מהשרת", err);
            userLists = { "מועדפים ❤️": [], "יעדים לטיסה ✈️": [], "הייתי שם 🌍": [] };
        }
    });
}

function saveUserLists() {
    let email = sessionStorage.getItem("loggedInEmail");

    if (!email) return;

    let requestData = {
        Email: email,
        Lists: userLists
    };

    $.ajax({
        type: "POST",
        url: `${BASE_API_URL}Users/SaveUserLists`,
        data: JSON.stringify(requestData),
        contentType: "application/json",
        success: function () {
            console.log("הרשימות עודכנו ב-SQL בהצלחה!");
        },
        error: function (err) {
            console.error("שגיאה בשמירת הרשימות בשרת", err);
        }
    });
}


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


$(document).ready(function () {

    checkLoginStatus();

    loadCountries();

    $(document).on("keyup", "#searchInput", applyFiltersAndSort);
    $(document).on("change", "#regionFilter, #sortBy, #currencyFilter", applyFiltersAndSort);

    $("#loginForm").submit(function (event) { loginUser(event); });
    $("#btnRegister").click(function (event) { registerUser(event); });

    $(document).on("click", "#btnLogout", function (e) {
        e.preventDefault();
        $.ajax({
            type: "POST",
            url: `${BASE_API_URL}Users/Logout`,
            xhrFields: { withCredentials: true },
            success: function () {
                currentUser = null;
                window.location.reload();
            }
        });
    });

    
    $(document).on('click', '.list-box input[type="checkbox"]', function (e) {
        if (!isLoggedIn()) {
            e.preventDefault(); 
            alert("עליך להתחבר לאתר תחילה כדי לנהל את הרשימות שלך.");
            return false;
        }
        if (isUserLocked()) {
            e.preventDefault();
            alert("חשבונך הוגבל. אינך מורשה לנהל רשימות.");
            return false;
        }
    });

    $(document).on('change', '.list-cb', function () {
        let id = String($(this).attr("data-id"));
        let listName = $(this).data("list");

        if (this.checked) {
            if (!userLists[listName].some(x => String(x) === id)) {
                userLists[listName].push(id);
            }
        } else {
            userLists[listName] = userLists[listName].filter(x => String(x) !== id);
        }

        saveUserLists();
        updateMapColors();
    });

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
    if (window.location.pathname.includes("my-lists.html") || window.location.pathname.includes("quizzes.html")) {
        if (isUserLocked()) {
            alert("חשבונך הוגבל על ידי הנהלת האתר. אין לך גישה לעמוד זה.");
            window.location.href = "index.html";
            return;
        }
    }

    $(document).on("click", "#btnEditProfile", function (e) {
        e.preventDefault();
        $("#editFirstName").val("");
        $("#editLastName").val("");
        $("#editPassword").val("");
        $("#editProfileModal").fadeIn();
    });

    $(document).on("submit", "#editProfileForm", function (e) {
        e.preventDefault();

        let currentEmail = sessionStorage.getItem("loggedInEmail");

        let typedFName = $("#editFirstName").val().trim();
        let typedLName = $("#editLastName").val().trim();
        let typedPassword = $("#editPassword").val().trim();

        if (typedFName === "" && typedLName === "" && typedPassword === "") {
            alert("לא הזנת שום נתון לעדכון.");
            return;
        }

        let updatedUser = {
            Email: currentEmail,
            FirstName: typedFName,
            LastName: typedLName,
            Password: typedPassword
        };

        $.ajax({
            type: "PUT",
            url: `${BASE_API_URL}Users/UpdateProfile`,
            data: JSON.stringify(updatedUser),
            contentType: "application/json",
            success: function (res) {
                alert("הפרופיל עודכן בהצלחה!");
                $("#editProfileModal").fadeOut();

                let currentFullName = sessionStorage.getItem("loggedInUser") || "";
                let nameParts = currentFullName.split(" ");
                let oldFName = nameParts[0] || "";
                let oldLName = nameParts.slice(1).join(" ") || "";

                let finalFName = typedFName !== "" ? typedFName : oldFName;
                let finalLName = typedLName !== "" ? typedLName : oldLName;

                let newFullName = finalFName + " " + finalLName;
                sessionStorage.setItem("loggedInUser", newFullName);
                $("#userGreeting").text("שלום, " + newFullName);
            },
            error: function (err) {
                alert("שגיאה בעדכון הפרופיל.");
                console.error(err);
            }
        });
    });
    if ($("#nightlifeMap").length > 0) {
        initNightlifeMap();
    }
});


function initMyListsPage() {
    processCountriesData();
    renderSidebars();
    initMap();
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

    let itemStyle = "display: flex; align-items: center; gap: 10px; padding: 8px 5px; margin-bottom: 2px; cursor: pointer; text-align: right; direction: rtl; width: 100%; border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.2s;";

    sorted.forEach(c => {
        let checkVis = userLists["הייתי שם 🌍"].includes(c.id) ? "checked" : "";
        $("#visited-list").append(
            `<label class="check-item" style="${itemStyle}" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='transparent'">
                <input type="checkbox" class="list-cb" data-id="${c.id}" data-list="הייתי שם 🌍" ${checkVis} style="margin: 0; cursor: pointer;"> 
                <span>${c.name}</span>
            </label>`
        );

        let checkWant = userLists["יעדים לטיסה ✈️"].includes(c.id) ? "checked" : "";
        $("#want-list").append(
            `<label class="check-item" style="${itemStyle}" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='transparent'">
                <input type="checkbox" class="list-cb" data-id="${c.id}" data-list="יעדים לטיסה ✈️" ${checkWant} style="margin: 0; cursor: pointer;"> 
                <span>${c.name}</span>
            </label>`
        );

        let checkFav = userLists["מועדפים ❤️"].includes(c.id) ? "checked" : "";
        $("#favorite-list").append(
            `<label class="check-item" style="${itemStyle}" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='transparent'">
                <input type="checkbox" class="list-cb" data-id="${c.id}" data-list="מועדפים ❤️" ${checkFav} style="margin: 0; cursor: pointer;"> 
                <span>${c.name}</span>
            </label>`
        );
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
        onRegionTooltipShow(event) {
            event.preventDefault();
        },
       
        onRegionClick: function (event, code) {
            if (!isLoggedIn()) {
                alert("עליך להתחבר לאתר תחילה כדי לסמן מדינות על המפה.");
                return;
            }
            if (isUserLocked()) {
                alert("חשבונך הוגבל. אינך מורשה לבצע פעולה זו.");
                return;
            }

            let country = alpha2ToCountry[code];
            if (!country) return;

            let id = String(country.id);

            let isVisited = userLists["הייתי שם 🌍"].some(x => String(x) === id);
            let isWant = userLists["יעדים לטיסה ✈️"].some(x => String(x) === id);
            let isFav = userLists["מועדפים ❤️"].some(x => String(x) === id);

            if (!isVisited && !isWant && !isFav) {
                userLists["הייתי שם 🌍"].push(id);
            } else if (isVisited) {
                userLists["הייתי שם 🌍"] = userLists["הייתי שם 🌍"].filter(x => String(x) !== id);
                userLists["יעדים לטיסה ✈️"].push(id);
            } else if (isWant) {
                userLists["יעדים לטיסה ✈️"] = userLists["יעדים לטיסה ✈️"].filter(x => String(x) !== id);
                userLists["מועדפים ❤️"].push(id);
            } else {
                userLists["מועדפים ❤️"] = userLists["מועדפים ❤️"].filter(x => String(x) !== id);
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
        let id = String($(this).attr("data-id"));
        let list = $(this).data("list");

        let isIdInList = userLists[list].some(x => String(x) === id);
        $(this).prop("checked", isIdInList);
    });
}

let currentUser = null; 

function checkLoginStatus() {
    $.ajax({
        type: "GET",
        url: `${BASE_API_URL}Users/CheckSession`,
        xhrFields: {
            withCredentials: true
        },
        success: function (user) {
            currentUser = user;

            sessionStorage.setItem("loggedInEmail", user.email);
            sessionStorage.setItem("loggedInUser", user.fullName);
            sessionStorage.setItem("isAdmin", user.isAdmin);
            sessionStorage.setItem("isMaster", user.isMaster);

            loadUserLists();

            $("#userGreetingLi").show();
            $("#userGreeting").text("שלום, " + user.fullName);
            $("#logoutLi").show();
            $("#editProfileLi").show();
            $("#loginLi").hide();
            $("#registerLi").hide();

            if (user.isAdmin) {
                $("#adminLinkLi").show();
            } else {
                $("#adminLinkLi").hide();
            }
        },
        error: function () {
            currentUser = null;
            sessionStorage.removeItem("loggedInEmail");

            userLists = { "מועדפים ❤️": [], "יעדים לטיסה ✈️": [], "הייתי שם 🌍": [] };

            $("#userGreetingLi").hide();
            $("#logoutLi").hide();
            $("#adminLinkLi").hide();
            $("#editProfileLi").hide();
            $("#loginLi").show();
            $("#registerLi").show();
        }
    });
}


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
    ajaxCall("POST", `${BASE_API_URL}Users/Register`, JSON.stringify(newUser), registerSuccess, registerError);
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
    ajaxCall("POST", `${BASE_API_URL}Users/Login`, JSON.stringify(loginData), loginSuccess, loginError);
}

function loginSuccess(data) {
    alert("התחברת בהצלחה!");
    window.location.href = "index.html";
}


function isLoggedIn() {
    return currentUser !== null;
}

function isUserLocked() {
    return currentUser !== null && currentUser.isLocked === true;
}

function loginError(err) {
    if (err.responseText) {
        alert(err.responseText); 
    } else {
        alert("שגיאה בהתחברות: בדוק את המייל והסיסמה.");
    }
}


function loadCountries() {
    ajaxCall("GET", `${BASE_API_URL}Countries/GetAllCountries`, null, getCountriesSuccess, getCountriesError);
}

function getCountriesSuccess(countries) {
    allCountries = countries.filter(c => c !== null);

    if ($(".countries-grid").length > 0) {
        populateCurrencyDropdown();
        renderCountries(allCountries);
    }

    if ($("#world-map").length > 0) {
        initMyListsPage();
    }
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
        saveUserLists(); 
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
        saveUserLists(); 
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
    saveUserLists(); 
    closeMoveModal();
    renderLists();
}


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
    ajaxCall("GET", `${BASE_API_URL}Shares/GetByCountry/${currentSharesCountryId}`, null, renderShares, renderSharesError);
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
        url: `${BASE_API_URL}Shares/AddShare`,
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
            url: `${BASE_API_URL}Shares/DeleteShare/${shareId}`,
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
            url: `${BASE_API_URL}Shares/UpdateShare`,
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

    quizTimer = setInterval(function () {
        timeLeft--;
        $("#timeRemaining").text(timeLeft);
        if (timeLeft <= 0) {
            endQuiz();
        }
    }, 1000);
}

function generateQuestion() {
    let shuffledCountries = [...allCountries].sort(() => 0.5 - Math.random());
    let options = shuffledCountries.slice(0, 4);
    let correctCountry = options[Math.floor(Math.random() * 4)]; 

    let questionHtml = "";
    $("#optionsContainer").empty();

    if (currentQuizType === 'capitals') {
        if (!correctCountry.city || correctCountry.city.trim() === "") {
            generateQuestion(); 
            return;
        }
        currentCorrectAnswer = correctCountry.city;
        questionHtml = `<h3 style="font-size: 1.8rem; margin-bottom: 30px;">מהי עיר הבירה של <span style="color: #3b82f6;">${correctCountry.name}</span>?</h3>`;

        options.forEach(opt => {
            let cityName = opt.city && opt.city.trim() !== "" ? opt.city : "לא ידוע";
            $("#optionsContainer").append(`<button class="quiz-option-btn" onclick="checkAnswer(this, '${cityName}')">${cityName}</button>`);
        });

    } else if (currentQuizType === 'flags') {
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
    $(".quiz-option-btn").prop("disabled", true);

    if (selectedAnswer === currentCorrectAnswer) {
        $(btnElement).addClass("correct");
        score++;
    } else {
        $(btnElement).addClass("wrong");
        $(".quiz-option-btn").each(function () {
            if ($(this).text() === currentCorrectAnswer) $(this).addClass("correct");
        });
    }

    setTimeout(() => {
        if (timeLeft > 0) {
            generateQuestion();
        }
    }, 1000);
}

function endQuiz() {
    clearInterval(quizTimer); 
    $("#activeQuizScreen").hide();

    let userEmail = sessionStorage.getItem("loggedInEmail");
    let earnedPoints = score * 10; 

    $("#finalScore").text(score);

    if (score > 0) {
        $("#pointsMessage").text(`כל הכבוד! הרווחת ${earnedPoints} נקודות פרופיל.`);
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

function updateUserPointsInDB(email, pointsToAdd) {
    let requestData = {
        Email: email,
        QuizType: currentQuizType, 
        Score: pointsToAdd
    };

    $.ajax({
        type: "POST", 
        url: `${BASE_API_URL}Users/UpdateHighScore`,
        data: JSON.stringify(requestData),
        contentType: "application/json",
        success: function () {
            console.log("הציון נשלח לשרת (יעודכן רק אם זה שיא חדש).");
        },
        error: function (err) {
            console.error("שגיאה בעדכון שיא:", err);
        }
    });
}


$(document).ready(function () {
    if (window.location.pathname.includes("admin.html")) {
        if (sessionStorage.getItem("isAdmin") !== "true") {
            alert("אין לך הרשאת גישה לדף זה!");
            window.location.href = window.location.href = "index.html";
        } else {
            loadAdminStats();
            loadAdminUsers();
        }
    }
});

function loadAdminStats() {
    ajaxCall("GET", `${BASE_API_URL}Admin/GetStats`, null, function (data) {
        $("#statLogins").text(data.dailyLogins);
        $("#statCountries").text(data.totalCountries);
        $("#statShares").text(data.totalShares);

        let totalSavedLocal = 0;
        $("#statSaved").text("נשמר ב-DB");
        $("#statSaved").text(totalSavedLocal);

    }, function (err) { console.error("שגיאה בטעינת סטטיסטיקות", err); });
}

function loadAdminUsers() {
    ajaxCall("GET", `${BASE_API_URL}Admin/GetUsers`, null, function (users) {
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
                actionBtn = `<span style="color:#94a3b8;">חסין מנעילה</span>`;
                adminBtn = `<span style="color:#94a3b8;">-</span>`;
            } else if (currentUserIsMaster) {
                actionBtn = u_isLocked ? `<button class="btn-unlock" onclick="toggleLock('${email}', false)">שחרר נעילה</button>`
                    : `<button class="btn-lock" onclick="toggleLock('${email}', true)">נעל משתמש</button>`;
                adminBtn = u_isAdmin ? `<button class="btn-demote" onclick="toggleAdmin('${email}', false)">הסר ניהול</button>`
                    : `<button class="btn-promote" onclick="toggleAdmin('${email}', true)">מנהל חדש</button>`;
            } else if (currentUserIsAdmin) {
                if (u_isAdmin) {
                    actionBtn = `<span style="color:#94a3b8;">אין הרשאה</span>`;
                    adminBtn = `<span style="color:#94a3b8;">אין הרשאה</span>`;
                } else {
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

function toggleAdmin(email, isAdminState) {
    let actionText = isAdminState ? 'להפוך משתמש זה למנהל' : 'להסיר הרשאות ניהול ממשתמש זה';
    if (confirm(`האם אתה בטוח שברצונך ${actionText}?`)) {

        let safeEmail = encodeURIComponent(email); 

        $.ajax({
            type: "PUT",
            url: `${BASE_API_URL}Admin/ToggleAdmin/${safeEmail}/${isAdminState}`,
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

function toggleLock(email, lockState) {
    if (confirm(`האם אתה בטוח שברצונך ${lockState ? 'לנעול' : 'לשחרר'} משתמש זה?`)) {

        let safeEmail = encodeURIComponent(email);

        $.ajax({
            type: "PUT",
            url: `${BASE_API_URL}Admin/ToggleLock/${safeEmail}/${lockState}`,
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

function generateAIItinerary(countryName) {
    if (!isLoggedIn()) {
        alert("רק משתמשים מחוברים יכולים להשתמש בסוכן הנסיעות החכם. אנא התחבר תחילה.");
        return;
    }
    let userMsg = $("#aiUserInput").val();

    if (!userMsg || userMsg.trim() === "") {
        alert("אנא כתוב בקשה או שאלה לבינה המלאכותית לפני השליחה.");
        return;
    }

    $("#btnAiItinerary").hide();
    $("#aiResultBox").hide();
    $("#aiLoading").fadeIn();

    let requestData = {
        CountryName: countryName,
        UserPrompt: userMsg
    };

    $.ajax({
        type: "POST", 
        url: `${BASE_API_URL}AI/AskAI`,
        contentType: "application/json",
        data: JSON.stringify(requestData),
        success: function (data) {
            $("#aiLoading").hide();
            $("#btnAiItinerary").show();
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


$(window).on('load', function () {

    setTimeout(function () {
        $("#preloader").fadeOut(600, function () {
            $(this).remove();
        });
    }, 800);
});

document.addEventListener("DOMContentLoaded", function () {
    const container = document.getElementById('globeBackground');
    if (!container) return;

    const globalPoints = [
        { lat: 32.0853, lng: 34.7818, name: "תל אביב (הבסיס שלנו)", color: "#2ecc71", size: 1.5 },
        { lat: 44.4268, lng: 26.1025, name: "בוקרשט", color: "#f39c12", size: 1.2 },
        { lat: 35.6762, lng: 139.6503, name: "טוקיו", color: "#ef4444", size: 1.5 },
        { lat: 31.2304, lng: 121.4737, name: "שנגחאי", color: "#3b82f6", size: 1.2 },
        { lat: 51.5074, lng: -0.1278, name: "לונדון", color: "#a855f7", size: 1.2 }
    ];


    const World = Globe()
        (container)
        .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-night.jpg') 
        .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')   
        .backgroundImageUrl('https://unpkg.com/three-globe/example/img/night-sky.png') 
        .pointsData(globalPoints)
        .pointLat('lat')
        .pointLng('lng')
        .pointColor('color')
        .pointAltitude(0.01)
        .pointRadius(d => d.size)
        .pointLabel('name');

    World.width(window.innerWidth);
    World.height(window.innerHeight);

    window.addEventListener('resize', () => {
        World.width(window.innerWidth);
        World.height(window.innerHeight);
    });

    World.controls().autoRotate = true;
    World.controls().autoRotateSpeed = 0.4;

    World.pointOfView({ lat: 25, lng: 35, altitude: 2.3 });
});

function openLeaderboard() {
    $("#leaderboardModal").fadeIn();

    // משיכת נתונים לחידון ערי בירה
    fetchLeaderboard('capitals', '#capitalsLeaderboardBody');

    // משיכת נתונים לחידון דגלים
    fetchLeaderboard('flags', '#flagsLeaderboardBody');
}

function fetchLeaderboard(quizType, tableBodySelector) {
    let tbody = $(tableBodySelector);
    tbody.html('<tr><td colspan="3" style="text-align:center;">טוען נתונים...</td></tr>');

    $.ajax({
        type: "GET",
        url: `${BASE_API_URL}Users/GetLeaderboard/${quizType}`,
        success: function (data) {
            tbody.empty();

            if (!data || data.length === 0) {
                tbody.html('<tr><td colspan="3" style="text-align:center; color: #94a3b8;">עדיין אין שיאים.</td></tr>');
                return;
            }

            data.forEach((player, index) => {
                let rankIcon = (index === 0) ? "🥇" : (index === 1) ? "🥈" : (index === 2) ? "🥉" : `${index + 1}`;
                let row = `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <td style="padding: 8px; font-weight: bold; color: #f59e0b;">${rankIcon}</td>
                        <td style="padding: 8px;">${player.fullName}</td>
                        <td style="padding: 8px; font-weight: bold; color: #2ecc71;">${player.score}</td>
                    </tr>
                `;
                tbody.append(row);
            });
        },
        error: function (err) {
            tbody.html('<tr><td colspan="3" style="text-align:center; color: #ef4444;">שגיאה בטעינה</td></tr>');
            console.error(err);
        }
    });
}


let nightlifeMap;
let markersLayer;

function initNightlifeMap() {
    nightlifeMap = L.map('nightlifeMap').setView([32.0853, 34.7818], 14);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(nightlifeMap);

    markersLayer = L.markerClusterGroup({
        chunkedLoading: true,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        maxClusterRadius: 50
    }).addTo(nightlifeMap);

    fetchPubsByRadius(32.0853, 34.7818);
}

function searchNightlife() {
    if (typeof isUserLocked === "function" && isUserLocked()) {
        alert("חשבונך הוגבל. אינך מורשה לבצע חיפושים במפה.");
        return;
    }

    let cityName = $("#citySearchInput").val().trim();
    if (!cityName) {
        alert("אנא הקלד שם של עיר באנגלית (למשל: Tokyo, London, Tel Aviv).");
        return;
    }

    $("#citySearchInput").prop("disabled", true);

    if ($("#mapLoader").length === 0) {
        $("#nightlifeMap").append('<div id="mapLoader" style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); z-index:9999; background:rgba(15,23,42,0.95); border:1px solid #f59e0b; padding:20px 40px; border-radius:12px; color:#fcd34d; font-size:1.3rem; font-weight:bold; box-shadow:0 0 30px rgba(0,0,0,0.8);"><i class="fas fa-spinner fa-spin" style="margin-left: 10px;"></i> סורק את העיר...</div>');
    } else {
        $("#mapLoader").fadeIn();
    }

    $.ajax({
        url: `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityName)}&format=json&limit=1`,
        type: 'GET',
        success: function (geoData) {
            $("#citySearchInput").prop("disabled", false);

            if (!geoData || geoData.length === 0) {
                $("#mapLoader").fadeOut();
                alert("לא מצאנו את המקום הזה. נסה לאיית באנגלית.");
                return;
            }

            let lat = parseFloat(geoData[0].lat);
            let lon = parseFloat(geoData[0].lon);

            nightlifeMap.flyTo([lat, lon], 14, { duration: 1.5 });

            setTimeout(() => {
                fetchPubsByRadius(lat, lon);
            }, 1500);
        },
        error: function () {
            $("#citySearchInput").prop("disabled", false);
            $("#mapLoader").fadeOut();
            alert("שגיאת תקשורת במציאת העיר. בדוק חיבור לאינטרנט.");
        }
    });
}

function fetchPubsByRadius(lat, lon) {
    markersLayer.clearLayers();

    let query = `
        [out:json][timeout:15];
        (
          nwr["amenity"~"pub|bar"](around:2000, ${lat}, ${lon});
        );
        out center 250; 
    `;

    $.ajax({
        type: "POST",
        url: "https://lz4.overpass-api.de/api/interpreter",
        data: { data: query },
        success: function (data) {
            $("#mapLoader").fadeOut();

            let pubs = data.elements;
            if (!pubs || pubs.length === 0) {
                alert("לא מצאנו פאבים במאגר הפתוח בדיוק ברדיוס הזה.");
                return;
            }

            let beerIcon = L.divIcon({
                html: '<i class="fas fa-map-marker-alt custom-beer-icon" style="color: #f59e0b; font-size: 32px;"></i>',
                className: 'empty-class',
                iconSize: [32, 32],
                iconAnchor: [16, 32],
                popupAnchor: [0, -32]
            });

            let markersArray = [];

            pubs.forEach(pub => {
                let pLat = pub.lat || (pub.center && pub.center.lat);
                let pLon = pub.lon || (pub.center && pub.center.lon);

                if (pLat && pLon && pub.tags) {
                    let name = pub.tags.name || pub.tags["name:en"] || "בר מקומי (ללא שם)";
                    let street = pub.tags["addr:street"] || pub.tags["addr:full"] || "כתובת לא צוינה";
                    let hours = pub.tags.opening_hours || "שעות לא צוינו";

                    let popupContent = `
                        <div style="text-align: right; padding: 5px;">
                            <h3 style="color: #f59e0b; margin: 0 0 10px 0; font-size: 1.2rem; border-bottom: 1px solid rgba(245,158,11,0.3); padding-bottom: 5px;">
                                <i class="fas fa-glass-cheers"></i> ${name}
                            </h3>
                            <p style="color: #cbd5e1; margin: 5px 0;"><i class="fas fa-map-marker-alt" style="color:#94a3b8; width: 15px;"></i> ${street}</p>
                            <p style="color: #cbd5e1; margin: 5px 0;"><i class="fas fa-clock" style="color:#94a3b8; width: 15px;"></i> <span dir="ltr">${hours}</span></p>
                        </div>
                    `;

                    let marker = L.marker([pLat, pLon], { icon: beerIcon });
                    marker.bindPopup(popupContent);

                    marker.on('mouseover', function () {
                        this.openPopup();
                    });

                    markersArray.push(marker);
                }
            });

            markersLayer.addLayers(markersArray);
        },
        error: function (err) {
            $("#mapLoader").fadeOut();
            console.error("שגיאה בשליפת הפאבים:", err);
            alert("השרת העולמי מתקשה לעבד את כמות הנתונים בעיר הזו כרגע. נסה עיר אחרת.");
        }
    });
}