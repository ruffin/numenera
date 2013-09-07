/**
 * Logic for handling loading and generation of character data for links, local storage, undo buffer, and so on.
 * Mixed into CharacterGenerator; doesn't do anything on its own and is only in its own file to keep the classes
 * a bit shorter.
 */
define([ "dojo/_base/declare",
         "dojo/_base/lang",
         "dojo/dom-construct",
         "dojo/io-query",
         "dojo/query",
         "dijit/Dialog",
         "dojo/on",
         "dojo/topic",
         "dijit/form/Button",
         "dojox/storage",
         "./_CharacterManager" ],
function( declare,
          lang,
          domConstruct,
          ioQuery,
          domQuery,
          Dialog,
          on,
          topic, 
          Button,
          storage,
          _CharacterManager )
{
    return declare([], {
        /**
         * Version of the data format understood by this implementation.
         */
        DATA_VERSION : "1.0.0",
        /**
         * Fields in the character data. There are rather a lot of these. Perhaps for a future version I'll replace
         * them with shorter ones. For now, clarity is king.
         */
        DATA_FIELDS : [ "version",
                        "descriptor",
                        "type",
                        "focus",
                        "finalized",
                        "tier",
                        "cyphers",
                        "selects",
                        "inputs",
                        "extra_equipment_text",
                        "notes_text",
                        "description_text",
                        "disabled",
                        "deleted" ],
        /**
         * Character used to break up lists in the data. We picked one that doesn't get escaped when we URL
         * encode it, rather than, say, a comma. This saves space.
         */
        _listDelimiter : "-",
        /**
         * Connects CharGen/dataChanged event to updateLink, and adds listener for keyups for the undo buffer.
         */
        postMixInProperties : function()
        {
            topic.subscribe( "CharGen/dataChanged", lang.hitch( this, this.updateLink ) );
            on( document, "keyup", lang.hitch( this, this.handleKeyUp ) );
        },
        /**
         * Checks if we have a query string, and calls popualteFromQueryString if we do. As a little undocumented
         * feature we also allow the keyword &print=true to go directly to the character sheet.
         */
        checkForStartupQuery : function()
        {
            if( window.location.search != "" )
            {
                this.populateFromQueryString();
                if( window.location.search.indexOf( "&print=true" ) != -1 )
                {
                    this.makePrint();
                }
            }
        },
        /**
         * If event was a Ctrl-Z, pop an item from the undo buffer and populateFromStoredData.
         */
        handleKeyUp : function( event )
        {
            if( event.keyCode == 90 && event.ctrlKey && this._buffer.length > 1 )
            {
                var prev = this._buffer.pop();
                this.populateFromStoredData( this._buffer[ this._buffer.length - 1 ] );
            }
        },
        /**
         * Calls populateFromStoredData on the query string, and updateLink.
         */
        populateFromQueryString : function()
        {
            this.populateFromStoredData( window.location.search.substring( 1 ) );
            this.updateLink();
        },
        /**
         * Calls _initStorage if necessary to start up our local storage manager; then stores the character
         * under a key derived from the character name with _getKey.
         */
        storeCharacter : function()
        {
            if( !this._storage )
            {
                this._initStorage();
            }
            var key = this._getKey( this.characterNameInput.value );
            var val = {
                name : this.characterNameInput.value,
                data : this._getCharacterData()
            };
            this._storage.put( key, val, lang.hitch( this, function() {
                this.saveButton.set( "disabled", true );
            }));
        },
        /**
         * Call _initStorage if necessary; then getKeys and display the stored characters in a manage dialog
         * that lets you delete or load them.
         */
        openCharacter : function()
        {
            if( !this._storage )
            {
                this._initStorage();
            }
            var chars = this._storage.getKeys();
            if( !this._dlog )
            {
                this._dlog = new Dialog({ title : "Manage characters" }).placeAt( document.body );
                this._dlog.startup();
            }
            this._cwa = [];
            this._dlog.set( "content", "" );
            var nde = domConstruct.create( "div", { style : "width:400px;padding:10px;" } );
            for( var i = 0; i < chars.length; i++ )
            {
                var _char = this._storage.get( chars[ i ] );
                if( _char.name && _char.data )
                {
                    this._cwa.push( new _CharacterManager({ key : chars[ i ], character : _char, manager : this }).placeAt( nde ) );
                }
            }
            if( this._cwa.length == 0 )
            {
                nde.innerHTML = "No stored characters.";
            }
            var btn = new Button({
                "style" : "display:block;text-align:center;",
                "label" : "Close",
                onClick : lang.hitch( this._dlog, this._dlog.hide )
            }).placeAt( nde );
            this._dlog.set( "content", nde );
            this._dlog.show();
        },
        /**
         * Loads character matching key from local store and hides dialog.
         */
        loadCharacter : function( /* String */ key )
        {
            var val = this._storage.get( key ).data;
            this._dlog.hide();
            this.populateFromStoredData( val );
            this.updateLink();
        },
        /**
         * Deletes character matching key from local store.
         */
        deleteCharacter : function( /* String */ key )
        {
            if( confirm( "Are you sure you want to delete " + this._storage.get( key ).name + "?" ) )
            {
                this._storage.remove( key );
                this.openCharacter();
            }
        },
        /**
         * Checks that we're not in the middle of something and that a type, focus, and descriptor are set;
         * then enables the save and print buttons and updates the link with the character data. Also pushes
         * the same data into the undo buffer.
         */
        updateLink : function()
        {
            if( this._populating.length > 0 )
            {
                return;
            }
            if( !this.getType() || !this.getFocus() || !this.getDescriptor() )
            {
                return;
            }
            this.saveButton.set( "disabled", false );
            this.printButton.set( "disabled", false );
            var qString = this._getCharacterData();
            var href = window.location.origin + window.location.pathname + "?" + qString; 
            this._buffer.push( qString );
            this.linkNode.href = href;
            //this.linkNode.innerHTML = "Share " + this.characterNameInput.value;
        },
        /**
         * Wraps _popualteFromStoredData in a try-catch block and displays a polite alert if something bad happened, e.g. because
         * the data was corrupted.
         */
        populateFromStoredData : function( /* String */ qString )
        {
            try
            {
                this._populateFromStoredData( qString );
            }
            catch( e )
            {
                console.log( e );
                this.clearAll();
                this.tell( "An error occurred loading the character. Perhaps the link was corrupted.<br/><br/>Sorry about that." );
            }
            this.onCharNameBlur( this.characterNameInput )
        },
        /**
         * Okay, the beef. Or one of them. We generate the character data with this method. Since we transfer the
         * data in a URL, we want to keep it as short as possible. This unfortunately means that it's not all that
         * robust to changes in the underlying framework. The idea is that we read the current selected indexes/values
         * and disabled states of all our selects/inputs and the deleted states of all controls that can be deleted into
         * terse parameters. The type, descriptor, and focus selectors and textareas are treated separately. To load
         * the data back, we reset the controls that affect the content of the page first, then restore the data in
         * the same order. The big advantage is that we don't have to have attribute names for each input. The downside
         * is that if we change something about the UI or data that adds or removes inputs or selects or changes their
         * order, the data won't load correctly.
         * 
         * See _populateFromStoredData for details on how this goes the other way.
         */
        _getCharacterData : function()
        {
            var sels = domQuery( "select.cg-storeMe", this.domNode );
            var inps = domQuery( "input.cg-storeMe", this.domNode );
            var idxs = [];
            var vals = [];
            var disb = [];
            var dels = [];
            for( var i = 0; i < sels.length; i++ )
            {
                idxs.push( sels[ i ].selectedIndex );
                disb.push( sels[ i ].disabled ? 1 : 0 );
            }
            for( var i = 0; i < inps.length; i++ )
            {
                if( inps[ i ].type == "checkbox" )
                {
                    vals.push( inps[ i ].checked ? "1" : "0" );
                }
                else
                {
                    vals.push( this._escapeDelimiter( inps[ i ].value ) );
                }
                disb.push( inps[ i ].disabled ? 1 : 0 );
            }
            for( var i = 0; i < this._controls.length; i++ )
            {
                if( this._controls[ i ].isDeletable )
                {
                    if( this._controls[ i ].deleted )
                    {
                        dels.push( 1 );
                    }
                    else
                    {
                        dels.push( 0 );
                    }
                }
            }
            return "version=" + escape( this.DATA_VERSION )
                + "&descriptor=" + this._selVal( this.descriptorSelect ).value
                + "&type=" + this._selVal( this.typeSelect ).value
                + "&focus=" + this._selVal( this.focusSelect ).value
                + "&finalized=" + this.finalized
                + "&tier=" + this.character_tier.value
                + "&cyphers=" + this.cypher_count.value
                + "&selects=" + encodeURIComponent( idxs.join( this._listDelimiter ) )
                + "&inputs=" + encodeURIComponent( vals.join( this._listDelimiter ) )
                + "&extra_equipment_text=" + encodeURIComponent( this.extra_equipment_text.value )
                + "&notes_text=" + encodeURIComponent( this.notes_text.value )
                + "&description_text=" + encodeURIComponent( this.description_text.value )
                + "&disabled=" + disb.join( "" )
                + "&deleted=" + dels.join( "" );
        },
        /**
         * Validates qString wtih _validateData. Then pushes something into the _populating stack, clearAll, parse out the
         * data from qString, sets type, descriptor, and focus selectors and _augmentCypherList, and finalize to tier from
         * kwObj.tier, if the character is finalized. At this point we have all the selects and inputs ready to be populated.
         * Then zips through selects, inputs, disabled, and deleted, and sets the states of the controls accordingly. Then
         * populates textareas and raises the character's stat floor if s/he is finalized. (If you saved in the middle of
         * tiering up, too bad, you can't bump the stats back down.) Completes by emitting a pleaseCheckState topic, which
         * will get any controls on the page to do just that.
         */
        _populateFromStoredData : function( /* String */ qString )
        {
            if( !this._validateData( qString ) )
            {
                return;
            }
            this._populating.push( 3 );
            this.clearAll();
            var kwObj = ioQuery.queryToObject( qString );
            var idxs = kwObj.selects.split( this._listDelimiter );
            var vals = kwObj.inputs.split( this._listDelimiter );
            var disb = kwObj.disabled ? kwObj.disabled : "";
            var dels = kwObj.deleted ? kwObj.deleted : "";
            this._selVal( this.descriptorSelect, kwObj.descriptor );
            this._selVal( this.typeSelect, kwObj.type );
            this._selVal( this.focusSelect, kwObj.focus );
            this.selectDescriptor();
            this._augmentCypherList( kwObj.cyphers );
            if( kwObj.finalized == "true" )
            {
                this.finalize( kwObj.tier );
            }
            var sels = domQuery( "select.cg-storeMe", this.domNode );
            var inps = domQuery( "input.cg-storeMe", this.domNode );
            for( var i = 0; i < idxs.length; i++ )
            {
                if( sels[ i ] )
                {
                    sels[ i ].selectedIndex = idxs[ i ];
                    sels[ i ].disabled = ( disb[ i ] == "1" );
                }
                else
                {
                    break;
                }
            }
            for( var i = 0; i < vals.length; i++ )
            {
                if( inps[ i ] )
                {
                    if( inps[ i ].type == "checkbox" )
                    {
                        inps[ i ].checked = vals[ i ] == "1" ? true : false;
                    }
                    else
                    {
                        inps[ i ].value = this._unescapeDelimiter( vals[ i ] );
                    }
                    inps[ i ].disabled = ( disb[ sels.length + i ] == "1" )
                }
            }
            if( this.finalized )
            {
                this.moveCaps();
            }
            this.checkCaps();
            var d = 0;
            for( var i = 0; i < this._controls.length; i++ )
            {
                if( this._controls[ i ].isDeletable )
                {
                    if( dels[ d ] == "1" )
                    {
                        this._controls[ i ].deleteMe();
                    }
                    d++;
                }
            }
            this.description_text.set( "value", kwObj.description_text );
            this.notes_text.set( "value", kwObj.notes_text );
            this.extra_equipment_text.set( "value", kwObj.extra_equipment_text );
            this._populating.pop();
            topic.publish( "CharGen/pleaseCheckState" );
        },
        /**
         * Parses qString into a kwObject, then checks that kwObj.version matches DATA_VERSION and that all the fields in DATA_FIELDS
         * are present. Displays a polite alert about the former; throws an exception about the latter.
         */
        _validateData : function( /* String */ qString )
        {
            var fields = this.DATA_FIELDS;
            var kwObj = ioQuery.queryToObject( qString );
            if( kwObj.version != this.DATA_VERSION )
            {
                this.tell( "The character was created with an incompatible version of this utility, and cannot be loaded. We apologize for the inconvenience." );
                return false;
            }
            for( var i = 0; i < fields.length; i++ )
            {
                if( kwObj[ fields[ i ] ] === undefined )
                {
                    throw( new Error( "Invalid data: expected " + fields[ i ] ) );
                }
            }
            return true;
        },
        /**
         * Replaces everything that's not a letter between a and z in the character name with underscores, and
         * returns it. This is so our characters are stored by name, more or less. If you have two different
         * characters named Röbin Høød and Røbin Hööd, you're SOL though 'cuz both will be stored as R_bin_H__d.
         */
        _getKey : function( nameStr )
        {
            return nameStr.replace( /[^a-z|A-Z]+/g, "_" );
        },
        /**
         * Initializes a dojox.storage.manager and puts a provider from it in this._storage.
         */
        _initStorage : function()
        {
            dojox.storage.manager.initialize(); // it's not ported to AMD, so...
            this._storage = dojox.storage.manager.getProvider();
            this._storage.initialize();
        },
        /**
         * Escapes our delimiter character in our stored values with three slashes. I'm assuming users won't type three slashes in
         * much and can deal with the mental anguish of seeing them converted into a dash when the data is loaded back.
         */
        _escapeDelimiter : function( /* String */ str )
        {
            return str.replace( /\-/g, "///" );
        },
        /**
         * Unescapes our delimiter character in our stored values.
         */
        _unescapeDelimiter : function( str )
        {
            return str.replace( /\/\/\//g, this._listDelimiter );
        }
    });
});