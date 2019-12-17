/**
  ##########         STATUS-TROCKNER          ##########
  Den Status des Wäschetrockner (fertig/läuft usw.) anhand des Stromverbrauches feststellen
  und für VIS ausgeben
  Idee aus https://forum.iobroker.net/topic/16306/gel%C3%B6st-waschetrockner-die-2-f%C3%A4llt-scheinbar-zwischen-drin-auch-immer-unter-100-watt

  17.12.2019:   V0.1.0  komplette Überarbeitung

  to do:

  Author: CKMartens (carsten.martens@outlook.de)
  License: GNU General Public License V3, 29. Juni 2007
**/

/**
  ##########         Variablen          ##########
**/

// Informationen mitloggen?
var DEBUG = true;

// Verwendeter Aktor zum Messen des Stromverbauchs
const AKTOR_AN = 'sonoff.0.sonoff_trockner.POWER';
const AKTOR_VERBRAUCH = 'sonoff.0.sonoff_trockner.ENERGY_Power';

// Ausgabe der Fertigmeldung
var ALEXA = true;                                                                // Ausgabe über Amazon Echo (über Adapter Alexa2)
var ECHO_DEVICE = 'G090P3028452005X';
var TELEGRAM = true;                                                            // Ausgabe über Telegram (über Adapter Telegram)
var EMPFAENGER = 'Carsten, Elke';

var checkEnde;

/**
  ##########         Datenpunkte          ##########
**/

// Datenpunkt unter 0_userdata.0 erstellen
const PATH = 'Status.Hausgeraete.Trocker.';

const DP_STROMAN = PATH + 'StromAn';
const DP_FERTIG = PATH + 'Fertig';
const DP_FERTIGZEIT = PATH + 'FertigZeit';
const DP_LAEUFT = PATH + 'Laeuft';

const DP_STROMAN_COMMON = {
    type: 'boolean',
    read: true,
    write: true,
    name: 'Ist beim Wäschetrockner der Strom an?',
    desc: 'Strom an',
    role: 'switch'
};
const DP_FERTIG_COMMON = {
    type: 'boolean',
    read: true,
    write: true,
    name: 'Ist beim Wäschetrockner fertig?',
    desc: 'Wäschetrockner fertig',
    role: 'switch'
};
const DP_LAEUFT_COMMON = {
    type: 'boolean',
    read: true,
    write: true,
    name: 'Läuft der Wäschetrockner?',
    desc: 'Wäschetrockner Läuft',
    role: 'switch'
};
const DP_FERTIGZEIT_COMMON = {
    type: 'string',
    read: true,
    write: true,
    name: 'Datum und Uhrzeit an dem der Wäschetrockner zuletzt fertig war',
    desc: 'Wäschetrockner war fertig um',
    role: 'value'
};

/**
  ##########         Skript          ##########
**/

createDp('0_userdata.0.' + DP_STROMAN, DP_STROMAN_COMMON);
createDp('0_userdata.0.' + DP_FERTIG, DP_FERTIG_COMMON);
createDp('0_userdata.0.' + DP_LAEUFT, DP_LAEUFT_COMMON);
createDp('0_userdata.0.' + DP_FERTIGZEIT, DP_FERTIGZEIT_COMMON);

// Skriptstart
Start();

/**
  ##########         Funktionen          ##########
**/

/**
 * Funktion bei Start des Skripts
 */
function Start() {
  var timeout;
  timeout = setTimeout(function () {
    setState('0_userdata.0.' + DP_STROMAN, false);
    setState('0_userdata.0.' + DP_FERTIG, false);
    setState('0_userdata.0.' + DP_LAEUFT, false);
    if (DEBUG === true)  console.log('Haushaltsgeräte: Wäschetrockner Skriptstart');
  }, 1500);
}

/**
 * Legt die Datenpunkte unter 0_userdata.0 an
 * Funktion von Pail53
 * siehe: https://forum.iobroker.net/topic/26839/vorlage-skript-erstellen-von-user-datenpunkten
 * @param {string}    id                Bezeichnung des Datenpunktes
 * @param {boolean}   common            Die Attribute des Datenpunktes
 */
function createDp(id, common) {
    if($(id).length) log('Datenpunkt ' + id + ' existiert bereits !', 'warn');
    else {
        var obj = {};
        obj.type = 'state';
        obj.common = common;
        setObject(id, obj, function (err) {
            if (err) log('Cannot write object: ' + err)
            else {
                var init = null;
                if(common.def === undefined) {
                    if(common.type === 'number') init = 0;
                    if(common.type === 'boolean') init = false;
                    if(common.type === 'string') init = '';
                } else init = common.def;
                setState(id, init, true);
            }
        });
    }
}

/**
  ##########         Trigger          ##########
**/

// Prüfen ob Wäschetrockner läuft
on({id: AKTOR_VERBRAUCH, change: "gt"}, function (obj) {
  if (getState('0_userdata.0.' + DP_STROMAN).val === true) {
    // Wäschetrockner läuft
    if (getState(AKTOR_VERBRAUCH).val >= 100 && getState('0_userdata.0.' + DP_LAEUFT).val == false) {
      setState('0_userdata.0.' + DP_FERTIG, false);
      setState('0_userdata.0.' + DP_LAEUFT, true);
      if (DEBUG === true)  console.log('Haushaltsgeräte: Wäschetrockner läuft');
    }
 }
});

// Prüfen ob der Wäschetrockner fertig
on({id: AKTOR_VERBRAUCH, change: "lt"}, function (obj) {
  if (getState(AKTOR_VERBRAUCH).val < 15 && getState('0_userdata.0.' + DP_LAEUFT).val == true && checkEnde == false) {
    checkEnde = setTimeout(function () {
      if (getState(AKTOR_VERBRAUCH).val < 5) {
        // Trockner ist Fertig
        setState('0_userdata.0.' + DP_LAEUFT, false);
        setState('0_userdata.0.' + DP_FERTIG, true);
        setState('0_userdata.0.' + DP_FERTIGZEIT, formatDate(new Date(), "TT.MM.JJJJ. SS:mm:ss"));
        // Strom abschalten
        setStateDelayed(AKTOR_AN, false, 1000, false);
        if (ALEXA) {
          let speak = 'Hallo. Entschuldige das ich störe. Aber der Wäschetrockner ist fertig. Der Strom zur Steckdose wurde abgeschaltet.';
          setState('alexa2.0.Echo-Devices.' + ECHO_DEVICE + '.Commands.speak', speak)
        }
        if (TELEGRAM) {
          sendTo("telegram.0", "send", {
            text: 'Hausgeräte: Wäschetrockner ist fertig',
            user: EMPFAENGER
          });
        }
        if (DEBUG === true)  console.log('Haushaltsgeräte: Wäschetrockner ist fertig, der Strom wurde angeschaltet');
      }
    (function () { if (checkEnde) {
      clearTimeout(checkEnde);
      checkEnde = null;
    }})();
      checkEnde = false;
    }, 300000);
  }
});

// Prüfen ob Wäschetrockner Strom hat
on({id: AKTOR_AN, change: "ne"}, function (obj) {
  if (AKTOR_AN === true && getState('0_userdata.0.' + DP_STROMAN).val === false) {
    // Stromzufuhr wurde angeschaltet
    setState('0_userdata.0.' + DP_STROMAN, true);
    if (DEBUG === true)  console.log('Haushaltsgeräte: Wäschetrockner Strom wurde angeschaltet');
  }
  if (AKTOR_AN === false && getState('0_userdata.0.' + DP_STROMAN).val === true) {
    // Stromzufuhr wurde ausgeschaltet
    setState('0_userdata.0.' + DP_STROMAN, false);
    if (DEBUG === true)  console.log('Haushaltsgeräte: Wäschetrockner Strom wurde ausgeschaltet');
  }
});