/**
  ##########         STATUS-TROCKNER          ##########
  Den Status des Wäschetrockner (fertig/läuft usw.) anhand des Stromverbrauches feststellen
  und für VIS ausgeben
  Idee aus https://forum.iobroker.net/topic/16306/gel%C3%B6st-waschetrockner-die-2-f%C3%A4llt-scheinbar-zwischen-drin-auch-immer-unter-100-watt

  17.12.2019:   V0.1.1  komplette Überarbeitung
  20.12.2019:   V0.1.5  Debug eingefügt, Check ob Fertig überarbeitet
  01.01.2020:   V0.2.0  Code optimiert
  01.01.2020:   V0.2.1  Bugfix: Löschen des Timeouts

  to do:

  Author: CKMartens (carsten.martens@outlook.de)
  License: GNU General Public License V3, 29. Juni 2007
**/

/**
  ##########         Variablen          ##########
**/

// Informationen mitloggen?
var DEBUG = true;
var LOGGING = true;

// Verwendeter Aktor zum Messen des Stromverbauchs
const AKTOR_AN = 'sonoff.0.sonoff_trockner.POWER';
const AKTOR_VERBRAUCH = 'sonoff.0.sonoff_trockner.ENERGY_Power';

// Ausgabe der Fertigmeldung
var ALEXA = true;                                                               // Ausgabe über Amazon Echo (über Adapter Alexa2)
var ECHO_DEVICE = '';
var TELEGRAM = true;                                                            // Ausgabe über Telegram (über Adapter Telegram)
var EMPFAENGER = '';

// Ab welcher Wattzahl ist die Maschine fertig (Standby Verbrauch)
var MIN_WATT = 3;
// Ab welcher Wattzahl soll regelmäßig geprüft werden ob die Maschine fertig (Knitterschutz Verbrauch)
var CHECK_WATT = 15;
// Welche Wattzahl wird im lauf nicht unterschritten
var ON_WATT = 100;
// Nach x Minuten wird geprüft ob MIN_WATT (Standby) erreicht wurde
var CHECK_TIME = 10;

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
    if (LOGGING === true)  console.log('Haushaltsgeräte: Wäschetrockner Skriptstart');
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
  if (getState('0_userdata.0.' + DP_STROMAN).val === true && getState('0_userdata.0.' + DP_LAEUFT).val == false) {
    // Wäschetrockner läuft
    if (getState(AKTOR_VERBRAUCH).val >= ON_WATT) {
      setState('0_userdata.0.' + DP_FERTIG, false);
      setState('0_userdata.0.' + DP_LAEUFT, true);
      if (LOGGING === true)  console.log('Haushaltsgeräte: Wäschetrockner gestartet');
      if (DEBUG === true)  console.log('Haushaltsgeräte: Wäschetrockner DEBUG Skriptstart');
    }
  }
  if (getState('0_userdata.0.' + DP_LAEUFT).val == true) {
    if (DEBUG === true) {
      let tmp_power = getState(AKTOR_VERBRAUCH).val;
      console.log('Haushaltsgeräte DEBUG: Wäschetrockner Verbrauch wieder angestiegen - AKTOR_VERBRAUCH=' + tmp_power + ' - CHECK_WATT=' + CHECK_WATT + ' - checkEnde=' + checkEnde);
    }
    if (getState(AKTOR_VERBRAUCH).val > CHECK_WATT && checkEnde == true) {
      clearTimeout(checkEnde);
      checkEnde = null;
      console.log('Haushaltsgeräte DEBUG: Wäschetrockner Verbrauch über CHECK_WATT gestiegen. Timeout gelöscht');
    }
  }
});

// Prüfen ob der Wäschetrockner fertig
on({id: AKTOR_VERBRAUCH, change: "lt"}, function (obj) {
  if (DEBUG === true)  console.log('Haushaltsgeräte DEBUG: Wäschetrockner Status checkEnde=' + checkEnde);
  if (getState(AKTOR_VERBRAUCH).val < CHECK_WATT && getState('0_userdata.0.' + DP_LAEUFT).val === true && checkEnde == undefined) {
    checkEnde = setTimeout(function () {
      if (DEBUG === true) {
        let tmp_power = getState(AKTOR_VERBRAUCH).val;
        console.log('Haushaltsgeräte: Wäschetrockner DEBUG AKTOR_VERBRAUCH=' + tmp_power + ' - MIN_WATT=' + MIN_WATT);
      }
      if (getState(AKTOR_VERBRAUCH).val < MIN_WATT) {
        if (DEBUG === true)  console.log('Haushaltsgeräte DEBUG: AKTOR_VERBRAUCH unter MIN_WATT');
        // Trockner ist Fertig
        setState('0_userdata.0.' + DP_LAEUFT, false);
        setState('0_userdata.0.' + DP_FERTIG, true);
        setState('0_userdata.0.' + DP_FERTIGZEIT, formatDate(new Date(), "TT.MM.JJJJ. SS:mm:ss"));
        // Strom abschalten
        setStateDelayed(AKTOR_AN, false, 1000, false);
        if (ALEXA) {
          let speak = 'Hallo. Entschuldige das ich störe. Aber der Wäschetrockner ist fertig. Der Strom zur Steckdose wurde abgeschaltet.';
          setState('alexa2.0.Echo-Devices.' + ECHO_DEVICE + '.Commands.speak', speak)
          if (DEBUG === true)  console.log('Haushaltsgeräte DEBUG: Alexa Benachrichtigung gesetzt');
        }
        if (TELEGRAM) {
          sendTo("telegram.0", "send", {
            text: 'Hausgeräte: Wäschetrockner ist fertig',
            user: EMPFAENGER
          });
          if (DEBUG === true)  console.log('Haushaltsgeräte DEBUG: Telegram Benachrichtigung gesendet');
        }
        if (LOGGING === true)  console.log('Haushaltsgeräte: Wäschetrockner ist fertig, der Strom wurde angeschaltet');
        clearTimeout(checkEnde);
        checkEnde = null;
      } else {
        clearTimeout(checkEnde);
        checkEnde = null;
      }
    }, CHECK_TIME * 60000);
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
