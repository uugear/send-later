var keepChecking;

Components.utils.import("resource:///modules/gloda/log4moz.js");

var checkTimeout;
var sl8tr_displayprogressbar;

var sl8tr_prefservice = Components.classes["@mozilla.org/preferences-service;1"].
                getService(Components.interfaces.nsIPrefBranch);


//mailnews.customDBHeaders 
var installedCustomHeaders = sl8tr_prefservice.getCharPref('mailnews.customDBHeaders');
if (installedCustomHeaders.indexOf("x-send-later-at")<0)
{
  dump("Installing Custom Header\n");
  sl8tr_prefservice.setCharPref('mailnews.customDBHeaders',installedCustomHeaders + " x-send-later-at");
}

checkTimeout = sl8tr_prefservice.getIntPref("extensions.sl8tr.checktimepref");
sl8tr_displayprogressbar = sl8tr_prefservice.getBoolPref("extensions.sl8tr.showprogress");

if (checkTimeout < 5000) checkTimeout = 60000;


var msgWindow = Components.classes["@mozilla.org/messenger/msgwindow;1"].createInstance();
msgWindow = msgWindow.QueryInterface(Components.interfaces.nsIMsgWindow);

var DisplayMessages = new Array();

var logger = null;

function SL8TRdump(msg)
{
  logger.info(msg);
}

function SL8TRdebug(msg)
{
  logger.debug(msg);
}

function initDebug()
{

	logger = Log4Moz.getConfiguredLogger("extensions.sl8tr",
					     Log4Moz.Level.Debug,
					     Log4Moz.Level.Info,
					     Log4Moz.Level.Debug);
}

initDebug();
function DisplayReport()
{
  if (DisplayMessages.length>0)
  {
     var msg = DisplayMessages.shift();
     document.getElementById("sendlater_status").value = msg;
     setTimeout("DisplayReport()",300);
  }
}

     
function StatusReportMsg(msg)
{
   if (!DisplayMessages.length)
   {
      setTimeout("DisplayReport()",300);
   }
   DisplayMessages.push(msg);   
}

function FormatDateTime(thisdate,includeTZ)
{
	var s="";
	var sDaysOfWeek = [ "Sun","Mon","Tue","Wed","Thu","Fri","Sat" ];
	var sMonths= ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

	var offset = thisdate.getTimezoneOffset();
	s += sDaysOfWeek[thisdate.getDay()];
	s += ", ";
	s += thisdate.getDate();
	s += " ";
	s += sMonths[thisdate.getMonth()];
	s += " ";
	s+=( thisdate.getFullYear());
	s += " ";
	var val = thisdate.getHours();
	if (val < 10)
	s += "0";
	s += val;
	s += ":";
	val = thisdate.getMinutes();
	if (val < 10)
	s += "0";
	s+= val;
	s += ":";
	val = thisdate.getSeconds();
	if (val < 10)
	s += "0";
	s+=val;
	if (includeTZ) 
	{
		s += " ";
		if (offset < 0) 
			{
			offset *= -1;
			s += "+";
			}
		else
			s += "-";

		val = Math.floor (offset / 60);
		if (val < 10)
			s += "0";
		s+=val;
		val = Math.floor (offset % 60);
		if (val < 10)
			s += "0";
		s+=val;
	}
	return s;
}
var animTimeout;

const FOLDER_IS_IDLE = 0;
const FOLDER_IS_LOADING = 1;
var folderstocheck = new Array();
var MessagesPending=0;
var copyServiceListener =  { sfileNP: null,
															QueryInterface : function(iid) 
															{
																	if (iid.equals(Components.interfaces.nsIMsgCopyServiceListener) ||
																									iid.equals(Components.interfaces.nsISupports))
																		return this;
																	throw Components.results.NS_NOINTERFACE;
																	return 0;
															 },

															OnProgress: function (progress, progressMax) {
															},

															OnStartCopy: function () {
															},

															OnStopCopy: function ( status ) {
															},

															SetMessageKey: function (key ) {
															}
															
										};
								

function SwitchToStatus()
{
	SL8TRdebug("STATUS MESSAGE - " + MessagesPending);
    document.getElementById("sendlater_deck").selectedIndex = 1;
     var strbundle = document.getElementById("sl8trbackgroundstrings");

   if (MessagesPending > 0) 
	{StatusReportMsg("SL8TR [" +strbundle.getString("PendingMessage") + " " + MessagesPending + "]");}
   else
	{StatusReportMsg("SL8TR ["+ strbundle.getString("IdleMessage") +"]");}
   
}

function CheckThisURI(messageURI)
{

	var msgSendLater = Components.classes["@mozilla.org/messengercompose/sendlater;1"]
                             .getService(Components.interfaces.nsIMsgSendLater);
	var fdrunsent = msgSendLater.getUnsentMessagesFolder(null);
	var content = "";
	var MsgService = messenger.messageServiceFromURI(messageURI);
	var messageHDR = messenger.msgHdrFromURI(messageURI);
	var MsgStream = Components.classes["@mozilla.org/network/sync-stream-listener;1"].createInstance();
	var consumer = MsgStream.QueryInterface(Components.interfaces.nsIInputStream);
	var ScriptInput = Components.classes["@mozilla.org/scriptableinputstream;1"].createInstance();
	var ScriptInputStream = ScriptInput .QueryInterface(Components.interfaces.nsIScriptableInputStream);

	clearTimeout(animTimeout);
	animTimeout = setTimeout("SwitchToStatus()",3000);

	SL8TRdebug("Checking message : " + messageURI + "\n");
	
	ScriptInputStream .init(consumer);
	MsgService .streamMessage(messageURI, MsgStream, msgWindow, null, false,null);
//	ScriptInputStream .available();
	var headerready=false;
	var xsendlaterpresent=false;
	
	while ((ScriptInputStream .available()) && ( (!headerready) || (headerready && xsendlaterpresent) ))
	{
		content = content + ScriptInputStream .read(512);
		if (!headerready)
		{
		   if (content.match(/\r\n\r\n/) || content.match(/\n\n/))
		   {
		   	 SL8TRdebug("header is now ready");
			   headerready = true;
		      if (content.match(/^X-Send-Later-At:.*$/m)) xsendlaterpresent = true;
		   }
		}
	}
	
	SL8TRdebug("HeaderReady = " + headerready + " , SendLaterPresent = " + xsendlaterpresent);
	var gotcha;
	if (xsendlaterpresent)
	gotcha =content.match(/^X-Send-Later-At:.*$/m).toString();
	else
	gotcha = false;
	if (gotcha)
	{
		SL8TRdump ("Found Pending Message.");
		var sendattime = new Date (gotcha.substr(16));
		var now = new Date();
		if (now > sendattime)
		{
			content = content.replace(/^Date:.*(\r?\n)$/m,"Date: "+ FormatDateTime(new Date(),true)+"$1");
			content = content.replace(/\nX-Send-Later-At:.*\r?\n/,"\n");

			// There is a bug in Thunderbird (3.1, at least) where
			// when a message is being sent from the user's Outbox
			// and then a copy is being uploaded into an IMAP
			// server's Sent Items folder, Thunderbird doesn't
			// convert bare \n to \r\n before trying to upload the
			// message copy.  This is a violation of the IMAP spec,
			// and some IMAP servers, e.g., Cyrus IMAPd, reject the
			// message because of the bare newlines.  So we have to
			// make sure that the message has only \r\n line
			// terminators in it before we put it into the Outbox.
			// It might *already* have \r\n line terminators in it,
			// so first we replace \r\n with \n, and then we
			// replace \n with \r\n.  The reason why we prepend a
			// "From - <date>" line to the message before doing
			// this is because if we don't, then CopyFileMessage
			// will prepend a couple of useless X-Mozilla-* headers
			// to the top of the message, and the headers it adds
			// will end with bare \n's on them, so we're back to
			// the original problem.
			content = "From - " + Date().toString() + "\r\n"
				+ content;
			content = content.replace(/\r\n/g,"\n").
				replace(/\n/g,"\r\n");

			var dirService = Components.classes["@mozilla.org/file/directory_service;1"].getService(Components.interfaces.nsIProperties);
			var tempDir = dirService.get("TmpD", Components.interfaces.nsIFile);
			var sfile = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
			sfile.initWithPath(tempDir.path);
			sfile.appendRelativePath("tempMsg" + messageHDR.messageId + ".eml");
			SL8TRdump("Saving message to " + sfile.path);
			if (sfile.exists()) sfile.remove(true);
			sfile.create(sfile.NORMAL_FILE_TYPE, 0600);
			var stream = Components.classes['@mozilla.org/network/file-output-stream;1'].createInstance(Components.interfaces.nsIFileOutputStream);
			stream.init(sfile, 2, 0x200, false); // open as "write only"
			stream.write(content, content.length);
			stream.close();
			var copyService = Components.classes["@mozilla.org/messenger/messagecopyservice;1"].createInstance();
			copyService = copyService.QueryInterface( Components.interfaces.nsIMsgCopyService);
			copyService.CopyFileMessage(sfile, fdrunsent, null, false, 0, "", copyServiceListener,msgWindow);
			if (sfile.exists()) sfile.remove(true);
			var dellist = Components.classes["@mozilla.org/array;1"].createInstance(Components.interfaces.nsIMutableArray);
			dellist.appendElement(messageHDR, false);
			messageHDR.folder.deleteMessages(dellist,msgWindow,true,false,null,false);
			msgSendLater.sendUnsentMessages(null);
			SL8TRdump ("Sending Message.");
			clearTimeout(animTimeout);
			animTimeout = setTimeout("SwitchToStatus()",3000);
		}
		else
		{
			MessagesPending++;
			SL8TRdump(MessagesPending + " messages still pending");
		}
	}
}                            
var folderLoadListener =
{
    OnItemEvent: function(folder, event)
    {
        var eventType = event.toString();
        
        if (eventType == "FolderLoaded")
        {
            if (folder)
            {
             folder.endFolderLoading();
				SL8TRdebug("FOLDER LOADED - " + folder.URI);
                if (folderstocheck.indexOf(folder.URI)>=0)
                {
                    clearTimeout(animTimeout);
                   	animTimeout = setTimeout("SwitchToStatus()",3000);

                    SL8TRdump("FOLDER MONITORED - " + folder.URI + "\n");
                    //folderstocheck.splice(folderstocheck.indexOf(folder.URI),1);
                    var thisfolder = folder.QueryInterface(Components.interfaces.nsIMsgFolder);
                    var messageenumerator = thisfolder.messages;
                    if ( messageenumerator )
                    {
                        SL8TRdump ("Got Enumerator\n");
                        while ( messageenumerator.hasMoreElements() )
                        {
                            var messageDBHDR = messageenumerator.getNext().QueryInterface(Components.interfaces.nsIMsgDBHdr);
                            var messageURI = thisfolder.getUriForMsg(messageDBHDR);
                            setTimeout("CheckThisURI('" + messageURI + "');",100);
                        }
                    }
		    else
		    {
		      SL8TRdump("No Enumerator\n");
		    }
                }
            }
		} 
    }
};
	
	 

function CheckForSendLater ()
{

	MessagesPending = 0;
	SL8TRdebug("One cycle of checking");
	
		var accountManager = Components.classes["@mozilla.org/messenger/account-manager;1"].getService(Components.interfaces.nsIMsgAccountManager);
	var fdrlocal = accountManager.localFoldersServer.rootFolder;
	
	folderstocheck = new Array();
	folderstocheck.push(fdrlocal.findSubFolder("Drafts").URI);
	SL8TRdump("SCHEDULE - " + fdrlocal.findSubFolder("Drafts").URI);
	fdrlocal.findSubFolder("Drafts").endFolderLoading();
	fdrlocal.findSubFolder("Drafts").startFolderLoading();
	fdrlocal.findSubFolder("Drafts").updateFolder(msgWindow);
	
	
	var allaccounts = accountManager.accounts;

	var acindex;
	SL8TRdebug("Progress Animation SET");
	if (sl8tr_displayprogressbar)
		document.getElementById("sendlater_deck").selectedIndex = 0;
	
	for (acindex = 0;acindex < allaccounts.Count();acindex++)
	{
		clearTimeout(animTimeout);
		animTimeout = setTimeout("SwitchToStatus()",5000);
		SL8TRdebug("Progress Animation RESET");
		var thisaccount = allaccounts.GetElementAt(acindex);
		if (thisaccount)
		{
			thisaccount = thisaccount.QueryInterface(Components.interfaces.nsIMsgAccount);
		
			SL8TRdebug(thisaccount.incomingServer.type + " - Identities [" + thisaccount.identities.Count() + "]");
			switch (thisaccount.incomingServer.type) 
			{
				   case "pop3":
				   case "imap":
							var identity;
							for (identity = 0;identity < thisaccount.identities.Count();identity++)
							{
								var thisfolder = GetMsgFolderFromUri(thisaccount.identities.GetElementAt(identity).QueryInterface(Components.interfaces.nsIMsgIdentity).draftFolder);
								{
									if (folderstocheck.indexOf(thisfolder.URI)<0)
									{
										folderstocheck.push (thisfolder.URI);
										SL8TRdump("SCHEDULE - " + thisfolder.URI );
										thisfolder.endFolderLoading();
										thisfolder.startFolderLoading();
										thisfolder.updateFolder(msgWindow);
									}
									else
									{
									   SL8TRdebug("Already scheduled - " + thisfolder.URI);
									}
								}
							}
							break;
					default:
							SL8TRdebug("Skipping this server type - " + thisaccount);
							break;

				
			}
		}
	}
	keepChecking = setTimeout("CheckForSendLater();",checkTimeout+Math.ceil(Math.random()*3000)-1500);
}
function startMonitor()
{
SL8TRdebug("Starting monitor [for every " + checkTimeout + "ms]");
var mailSession = Components.classes["@mozilla.org/messenger/services/session;1"].getService(Components.interfaces.nsIMsgMailSession);
mailSession.AddFolderListener(folderLoadListener,Components.interfaces.nsIFolderListener.event);
keepChecking = setTimeout("CheckForSendLater();",2000);//checkTimeout+Math.ceil(Math.random()*3000)-1500);
}

setTimeout("startMonitor();",5000);
