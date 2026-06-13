/**
 * Home Widget
 * purpose - Icon based notice popup widget.
 */
; VIS = window.VIS || {};

; (function (VIS, $) {

    VIS.NewNoticeWidget = function () {
        this.frame;
        this.windowNo;

        var $self = this;
        var $root = $('<div class="vis-new-notice-widget">');
        var $popupWrap;
        var $noticeList;
        var noticePageSize = 20;
        var noticePageNo = 1;
        var recordsCount = 0;
        var isLoadingNotices = false;
        var hasMoreNotices = true;
        var lastRenderedGroup = "";
        var messageTypeCounts = {};
        var noticeRequestVersion = 0;
        var allNoticeIds = [];
        var allNoticeRecords = [];
        var activeChipFilter = null;
        var filteredNotices = [];
        var renderedFilteredCount = 0;
        var isAcknowledging = false;

        this.Initalize = function () {
            createWidget();
            events();
        };

        /*
         * New notice labels
         * Text                        | Message key                         | Fallback
         * Notices                     | Notice                              | Notices
         * Notice                      | Notice                              | Notice
         * Refresh                     | Refresh                             | Refresh
         * Close                       | Close                               | Close
         * All                         | All                                 | All
         * total                       | Total                               | total
         * selected                    | Selected                            | selected
         * Clear                       | Clear                               | Clear
         * Acknowledge                 | Acknowledge                         | Acknowledge
         * Today                       | Today                               | Today
         * Yesterday                   | Yesterday                           | Yesterday
         * No records found            | NoRecordFound                       | No records found
         * Loading...                  | Loading                             | Loading...
         * Confirm acknowledge all     | VIS_AcknowledgeAllConfirm           | Are you sure you want to acknowledge all notices?
         */
        function lbl(key, fallback) {
            var text = VIS.Msg.getMsg(key);
            return text && text !== "[" + key + "]" ? text : fallback;
        }

        function events() {
            $root.find(".vis-new-notice-trigger").on("click", function () {
                openPopup();
            });

            $popupWrap.find(".vis-new-notice-close, .vis-new-notice-backdrop").on("click", function () {
                closePopup();
            });

            $popupWrap.find(".ack-all").on("click", function () {
                if (window.confirm(lbl("VIS_AcknowledgeAllConfirm", "Are you sure you want to acknowledge all notices?"))) {
                    acknowledgeAllNotices();
                }
            });

            $popupWrap.find(".bulk-pill.primary").on("click", function () {
                acknowledgeSelectedNotices();
            });

            $popupWrap.find(".bulk-link").on("click", function () {
                clearSelectedNotices();
            });

            $popupWrap.find(".vis-new-notice-refresh").on("click", function () {
                resetAndLoadNotices();
            });

            $popupWrap.on("click", ".fchip", function () {
                applyChipFilter($(this).data("filter") || "");
            });

            $popupWrap.find(".pop-list").on("scroll", function () {
                if (this.scrollTop + this.clientHeight >= this.scrollHeight - 80) {
                    if (activeChipFilter === null) {
                        loadNextNoticePage();
                    }
                    else {
                        renderNextFilteredNotices();
                    }
                }
            });

            $popupWrap.on("click", ".notice", function (event) {
                if ($(event.target).closest(".quick-ack").length > 0) {
                    return;
                }

                var $notice = $(this);
                var $checkbox = $notice.find(".checkbox");
                $notice.toggleClass("selected");
                $checkbox.toggleClass("checked");
                $checkbox.empty();
                if ($checkbox.hasClass("checked")) {
                    $checkbox.append('<span class="vis vis-markx"></span>');
                }
                updateSelectionState();
            });

            $popupWrap.on("click", ".quick-ack", function (event) {
                event.stopPropagation();
                var noteId = $(this).closest(".notice").data("note-id");
                acknowledgeNoticeIds([noteId]);
            });

            $root.on("keydown", function (event) {
                if (event.key === "Escape") {
                    closePopup();
                }
            });
        }

        function createWidget() {
            var noticeLabel = lbl("Notice", "Notice");
            var noticesLabel = lbl("Notice", "Notices");
            var refreshLabel = lbl("Refresh", "Refresh");
            var closeLabel = lbl("Close", lbl("close", "Close"));
            var totalLabel = lbl("Total", "total");
            var selectedLabel = lbl("Selected", "selected");
            var clearLabel = lbl("Clear", "Clear");
            var acknowledgeLabel = lbl("Acknowledge", "Acknowledge");
            var allLabel = lbl("All", "All");

            var widget =
                '<div class="vis-new-notice-shell">' +
                '  <button type="button" class="vis-new-notice-trigger" title="' + VIS.Utility.encodeText(noticeLabel) + '" aria-label="' + VIS.Utility.encodeText(noticeLabel) + '">' +
                '    <span class="vis-new-notice-icon">' +
                '      <span class="vis vis-notice"></span>' +
                '    </span>' +
                '    <span class="vis-new-notice-badge">249</span>' +
                '  </button>' +
                '  <div class="vis-new-notice-widget vis-new-notice-modal" aria-hidden="true">' +
                '    <div class="vis-new-notice-backdrop"></div>' +
                '    <div class="vis-new-notice-popup-holder">' +
                '      <section class="popup" role="dialog" aria-modal="true" aria-labelledby="visNewNoticeTitle">' +
                '        <div class="pop-head">' +
                '          <div class="pop-title">' +
                '            <span class="pop-icon"><span class="vis vis-notice"></span></span>' +
                '            <div>' +
                '              <h2 id="visNewNoticeTitle">' + VIS.Utility.encodeText(noticesLabel) + '</h2>' +
                '              <div class="sub"><strong class="vis-new-notice-total">0</strong> ' + VIS.Utility.encodeText(totalLabel) + '</div>' +
                '            </div>' +
                '          </div>' +
                '          <div class="pop-actions">' +
                '            <button type="button" class="pop-icon-btn vis-new-notice-refresh" title="' + VIS.Utility.encodeText(refreshLabel) + '" aria-label="' + VIS.Utility.encodeText(refreshLabel) + '"><span class="vis vis-refresh"></span></button>' +
                '            <button type="button" class="pop-icon-btn vis-new-notice-close" title="' + VIS.Utility.encodeText(closeLabel) + '" aria-label="' + VIS.Utility.encodeText(closeLabel) + '"><span class="vis vis-cross"></span></button>' +
                '          </div>' +
                '        </div>' +
                '        <div class="pop-tools">' +
                '          <span class="fchip active">' + VIS.Utility.encodeText(allLabel) + ' <span class="fcount vis-new-notice-total">0</span></span>' +
                '        </div>' +
                '        <div class="pop-bulk vis-new-notice-selectionbar">' +
                '          <span class="bulk-label"><strong class="vis-new-notice-selected-count">0</strong> ' + VIS.Utility.encodeText(selectedLabel) + '</span>' +
                '          <span class="bulk-spacer"></span>' +
                '          <span class="bulk-link">' + VIS.Utility.encodeText(clearLabel) + '</span>' +
                '          <button type="button" class="bulk-pill primary"><span class="vis vis-markx"></span>' + VIS.Utility.encodeText(acknowledgeLabel) + '</button>' +
                '        </div>' +
                '        <div class="pop-list"></div>' +
                '        <div class="pop-foot">' +
                '          <span class="ack-all"><span class="vis vis-markx"></span>' + VIS.Utility.encodeText(acknowledgeLabel) + ' ' + VIS.Utility.encodeText(allLabel) + ' <span class="vis-new-notice-total">0</span></span>' +
                '        </div>' +
                '      </section>' +
                '    </div>' +
                '  </div>' +
                '</div>';

            $root.append(widget);
            $popupWrap = $root.find(".vis-new-notice-modal");
            if (VIS.Application.isRTL) {
                $popupWrap.attr("dir", "rtl");
            }
            $("body").append($popupWrap);
            $noticeList = $popupWrap.find(".pop-list");
            resetAndLoadNotices();
            updateSelectionState();
        }

        function resetAndLoadNotices() {
            noticePageNo = 1;
            recordsCount = 0;
            hasMoreNotices = true;
            lastRenderedGroup = "";
            messageTypeCounts = {};
            allNoticeIds = [];
            allNoticeRecords = [];
            activeChipFilter = null;
            filteredNotices = [];
            renderedFilteredCount = 0;
            noticeRequestVersion += 1;
            $noticeList.empty();
            updateTotalCount(0);
            updateMessageTypeChips();
            updateSelectionState();
            loadNextNoticePage();
        }

        function loadNextNoticePage() {
            if (isLoadingNotices || !hasMoreNotices) {
                return;
            }

            isLoadingNotices = true;
            showListLoading(true);
            var requestVersion = noticeRequestVersion;

            $.ajax({
                url: VIS.Application.contextUrl + "Home/GetJSONHomeNotice",
                data: { "pageSize": noticePageSize, "page": noticePageNo, "isTabDataRef": noticePageNo === 1 },
                type: "GET",
                datatype: "json",
                success: function (result) {
                    var data = [];

                    if (requestVersion !== noticeRequestVersion) {
                        return;
                    }

                    if (result && result.data) {
                        data = JSON.parse(result.data);
                    }

                    if (noticePageNo === 1) {
                        recordsCount = VIS.Utility.Util.getValueOfInt(result.count);
                        updateTotalCount(recordsCount);
                        loadMessageTypeCounts(requestVersion);
                    }

                    if (data.length > 0) {
                        appendNoticeRecords(data);
                        noticePageNo += 1;
                        hasMoreNotices = recordsCount === 0 || ((noticePageNo - 1) * noticePageSize) < recordsCount;
                    }
                    else {
                        hasMoreNotices = false;
                        if ($noticeList.find(".notice").length === 0) {
                            $noticeList.append("<p class='vis-new-notice-empty'>" + lbl("NoRecordFound", "No records found") + "</p>");
                        }
                    }
                },
                complete: function () {
                    if (requestVersion !== noticeRequestVersion) {
                        return;
                    }
                    isLoadingNotices = false;
                    showListLoading(false);
                }
            });
        }

        function loadMessageTypeCounts(requestVersion) {
            if (recordsCount <= 0) {
                updateMessageTypeChips();
                return;
            }

            $.ajax({
                url: VIS.Application.contextUrl + "Home/GetJSONHomeNotice",
                data: { "pageSize": recordsCount, "page": 1, "isTabDataRef": false },
                type: "GET",
                datatype: "json",
                success: function (result) {
                    var data = [];
                    var counts = {};
                    var ids = [];

                    if (requestVersion !== noticeRequestVersion) {
                        return;
                    }

                    if (result && result.data) {
                        data = JSON.parse(result.data);
                    }

                    for (var i = 0; i < data.length; i++) {
                        var msgType = data[i].MsgType ? data[i].MsgType : lbl("Notice", "Notice");
                        counts[msgType] = (counts[msgType] || 0) + 1;
                        ids.push(data[i].AD_Note_ID);
                    }

                    messageTypeCounts = counts;
                    allNoticeIds = ids;
                    allNoticeRecords = data;
                    updateMessageTypeChips();
                }
            });
        }

        function appendNoticeRecords(data) {
            var html = "";

            for (var i = 0; i < data.length; i++) {
                var notice = mapNoticeRecord(data[i]);

                if (notice.groupLabel !== lastRenderedGroup) {
                    lastRenderedGroup = notice.groupLabel;
                    html += '<div class="group-label">' + VIS.Utility.encodeText(lastRenderedGroup) + '</div>';
                }

                html += createNotice(notice);
            }

            $noticeList.append(html);
        }

        function mapNoticeRecord(record) {
            var createdDate = record.CDate ? new Date(record.CDate) : null;
            var rawMsgType = record.MsgType ? record.MsgType : lbl("Notice", "Notice");
            var msgType = VIS.Utility.encodeText(rawMsgType);
            var title = record.Title ? VIS.Utility.encodeText(noticeTimeConversion(record.Title)) : msgType;
            var description = record.Description ? VIS.Utility.encodeText(noticeTimeConversion(record.Description)) : "";

            return {
                stateClass: "",
                checkboxClass: "",
                typeClass: getNoticeTypeClass(rawMsgType),
                type: msgType,
                filterType: rawMsgType,
                noticeDate: getNoticeDateText(createdDate),
                title: title,
                preview: description,
                time: getNoticeTimeText(createdDate),
                showQuickAck: true,
                groupLabel: getNoticeGroupLabel(createdDate),
                noteId: record.AD_Note_ID,
                tableName: record.TableName,
                windowId: record.AD_Window_ID,
                recordId: record.Record_ID
            };
        }

        function getNoticeTypeClass(type) {
            var classes = ["tp-workflow", "tp-request", "tp-report", "tp-alert", "tp-system"];
            var hash = 0;

            for (var i = 0; i < type.length; i++) {
                hash = ((hash << 5) - hash) + type.charCodeAt(i);
                hash = hash & hash;
            }

            return classes[Math.abs(hash) % classes.length];
        }

        function updateTotalCount(count) {
            $popupWrap.find(".vis-new-notice-total").text(count);
            $root.find(".vis-new-notice-badge").text(count);
        }

        function updateMessageTypeChips() {
            var allActive = activeChipFilter === null || activeChipFilter === "";
            var html = '<span class="fchip ' + (allActive ? "active" : "") + '" data-filter="">' + VIS.Utility.encodeText(lbl("All", "All")) + ' <span class="fcount vis-new-notice-total">' + recordsCount + '</span></span>';
            var types = Object.keys(messageTypeCounts);

            for (var i = 0; i < types.length; i++) {
                html += '<span class="fchip ' + (activeChipFilter === types[i] ? "active" : "") + '" data-filter="' + VIS.Utility.encodeText(types[i]) + '">' + VIS.Utility.encodeText(types[i]) + ' <span class="fcount">' + messageTypeCounts[types[i]] + '</span></span>';
            }

            $popupWrap.find(".pop-tools").empty().append(html);
        }

        function applyChipFilter(filter) {
            if (allNoticeRecords.length === 0 && recordsCount > 0) {
                loadAllNoticeRecords(function () {
                    applyChipFilter(filter);
                });
                return;
            }

            activeChipFilter = filter;
            filteredNotices = [];
            renderedFilteredCount = 0;
            lastRenderedGroup = "";
            $noticeList.empty();
            clearSelectedNotices();

            for (var i = 0; i < allNoticeRecords.length; i++) {
                var notice = mapNoticeRecord(allNoticeRecords[i]);
                if (!filter || notice.filterType === filter) {
                    filteredNotices.push(notice);
                }
            }

            updateMessageTypeChips();
            renderNextFilteredNotices();
        }

        function renderNextFilteredNotices() {
            if (renderedFilteredCount >= filteredNotices.length) {
                if (filteredNotices.length === 0 && $noticeList.find(".vis-new-notice-empty").length === 0) {
                    $noticeList.append("<p class='vis-new-notice-empty'>" + lbl("NoRecordFound", "No records found") + "</p>");
                }
                return;
            }

            var nextCount = Math.min(renderedFilteredCount + noticePageSize, filteredNotices.length);
            var html = "";

            for (var i = renderedFilteredCount; i < nextCount; i++) {
                if (filteredNotices[i].groupLabel !== lastRenderedGroup) {
                    lastRenderedGroup = filteredNotices[i].groupLabel;
                    html += '<div class="group-label">' + VIS.Utility.encodeText(lastRenderedGroup) + '</div>';
                }
                html += createNotice(filteredNotices[i]);
            }

            renderedFilteredCount = nextCount;
            $noticeList.append(html);
        }

        function showListLoading(show) {
            $popupWrap.find(".vis-new-notice-loading").remove();
            if (show) {
                $noticeList.append("<div class='vis-new-notice-loading'>" + lbl("Loading", "Loading...") + "</div>");
            }
        }

        function getNoticeDateText(date) {
            if (!date || isNaN(date.getTime())) {
                return "";
            }
            return Globalize.format(date, "d", Globalize.cultureSelector);
        }

        function getNoticeTimeText(date) {
            if (!date || isNaN(date.getTime())) {
                return "";
            }
            return Globalize.format(date, "t", Globalize.cultureSelector);
        }

        function getNoticeGroupLabel(date) {
            if (!date || isNaN(date.getTime())) {
                return lbl("Notice", "Notice");
            }

            var today = new Date();
            var yesterday = new Date();
            yesterday.setDate(today.getDate() - 1);

            if (date.toDateString() === today.toDateString()) {
                return lbl("Today", "Today");
            }
            if (date.toDateString() === yesterday.toDateString()) {
                return lbl("Yesterday", "Yesterday");
            }
            return getNoticeDateText(date);
        }

        function noticeTimeConversion(title) {
            if (title && title.lastIndexOf("UTC") > 0) {
                var splitTitle = title.split("UTC");
                title = title.replaceAll("UTC", "");
                if (splitTitle.length > 0) {
                    for (var i = 0; i < splitTitle.length; i++) {
                        var dt = splitTitle[i].substring(splitTitle[i].lastIndexOf(": ") + 1, splitTitle[i].length);
                        if (dt.lastIndexOf("AM") > 0 || dt.lastIndexOf("PM") > 0) {
                            var dte = new Date(dt + "UTC");
                            title = title.replace(dt, " " + dte.toLocaleString());
                        }
                    }
                }
            }
            return title;
        }

        function createNotice(notice) {
            var quickAck = notice.showQuickAck ? '<span class="quick-ack" title="' + VIS.Utility.encodeText(lbl("Acknowledge", "Acknowledge")) + '"><span class="vis vis-markx"></span></span>' : '';
            var checkedMark = notice.checkboxClass === "checked" ? '<span class="vis vis-markx"></span>' : '';
            var dateText = notice.noticeDate ? '<span class="notice-date">' + notice.noticeDate + '</span>' : '';

            return '' +
                '<div class="notice ' + notice.stateClass + '" data-note-id="' + notice.noteId + '">' +
                '  <div class="notice-cb-wrap"><span class="checkbox ' + notice.checkboxClass + '">' + checkedMark + '</span></div>' +
                '  <div class="notice-content">' +
                '    <div class="notice-toprow">' +
                '      <span class="type-pill ' + notice.typeClass + '"><span class="tp-dot"></span>' + notice.type + '</span>' +
                dateText +
                '    </div>' +
                '    <div class="notice-title">' + notice.title + '</div>' +
                '    <div class="notice-preview">' + notice.preview + '</div>' +
                '  </div>' +
                '  <div class="notice-side"><span class="notice-time">' + notice.time + '</span>' + quickAck + '</div>' +
                '</div>';
        }

        function acknowledgeSelectedNotices() {
            var ids = [];

            $popupWrap.find(".notice.selected").each(function () {
                ids.push($(this).data("note-id"));
            });

            acknowledgeNoticeIds(ids);
        }

        function acknowledgeAllNotices() {
            if (allNoticeIds.length > 0) {
                acknowledgeNoticeIds(allNoticeIds.slice(0));
                return;
            }

            loadAllNoticeRecords(function () {
                var ids = [];

                for (var i = 0; i < allNoticeRecords.length; i++) {
                    ids.push(allNoticeRecords[i].AD_Note_ID);
                }

                allNoticeIds = ids;
                acknowledgeNoticeIds(ids);
            });
        }

        function loadAllNoticeRecords(callback) {
            if (allNoticeRecords.length > 0) {
                callback();
                return;
            }

            if (recordsCount <= 0) {
                callback();
                return;
            }

            $.ajax({
                url: VIS.Application.contextUrl + "Home/GetJSONHomeNotice",
                data: { "pageSize": recordsCount, "page": 1, "isTabDataRef": false },
                type: "GET",
                datatype: "json",
                success: function (result) {
                    var data = [];

                    if (result && result.data) {
                        data = JSON.parse(result.data);
                    }

                    allNoticeRecords = data;
                    callback();
                }
            });
        }

        function acknowledgeNoticeIds(ids) {
            ids = $.grep(ids, function (id) {
                return VIS.Utility.Util.getValueOfInt(id) > 0;
            });
            ids = $.grep(ids, function (id, index) {
                return $.inArray(id, ids) === index;
            });

            if (ids.length === 0 || isAcknowledging) {
                return;
            }

            isAcknowledging = true;
            showListLoading(true);
            acknowledgeNoticeAtIndex(ids, 0);
        }

        function acknowledgeNoticeAtIndex(ids, index) {
            if (index >= ids.length) {
                isAcknowledging = false;
                showListLoading(false);
                resetAndLoadNotices();
                return;
            }

            $.ajax({
                url: VIS.Application.contextUrl + "Home/ApproveNotice",
                data: { "Ad_Note_ID": ids[index], "isAcknowldge": true },
                type: "POST",
                datatype: "json",
                complete: function () {
                    acknowledgeNoticeAtIndex(ids, index + 1);
                }
            });
        }

        function clearSelectedNotices() {
            $popupWrap.find(".notice.selected").each(function () {
                var $notice = $(this);
                $notice.removeClass("selected");
                $notice.find(".checkbox").removeClass("checked").empty();
            });
            updateSelectionState();
        }

        function openPopup() {
            $popupWrap.addClass("is-open").attr("aria-hidden", "false");
            $root.attr("tabindex", "-1").trigger("focus");
        }

        function closePopup() {
            $popupWrap.removeClass("is-open").attr("aria-hidden", "true");
        }

        function updateSelectionState() {
            var selectedCount = $popupWrap.find(".notice.selected").length;
            $popupWrap.find(".vis-new-notice-selected-count").text(selectedCount);
            $popupWrap.find(".vis-new-notice-selectionbar").toggleClass("is-visible", selectedCount > 0);
        }

        this.refreshWidget = function () {
        };

        this.getRoot = function () {
            return $root;
        };

        this.disposeComponent = function () {
            $popupWrap.remove();
            $root.remove();
        };
    };

    VIS.NewNoticeWidget.prototype.refreshWidget = function () {
    };

    VIS.NewNoticeWidget.prototype.init = function (windowNo, frame) {
        this.frame = frame;
        this.AD_UserHomeWidgetID = frame.widgetInfo.AD_UserHomeWidgetID;
        this.windowNo = windowNo;
        this.Initalize();
        this.frame.getContentGrid().append(this.getRoot());
    };

    VIS.NewNoticeWidget.prototype.widgetSizeChange = function (height, width) {
    };

    VIS.NewNoticeWidget.prototype.dispose = function () {
        this.disposeComponent();
        if (this.frame) {
            this.frame.dispose();
        }
        this.frame = null;
    };
})(VIS, jQuery);
