(function() 
{
    const ArduinoHelper = require('ArduinoHelper')();
    const Periodic = require( 'Periodic' );
    const Listener = require( 'Listener' );

    // Encoding helper functions
    function encode( floatIn )
    {
        return parseInt( float * 1000 );
    }

    function decode( intIn )
    {
        return ( intIn * 0.001 );
    }

    class CameraServo
    {
        constructor(name, deps)
        {
            console.log( 'CameraServo plugin loaded' );

            this.globalBus  = deps.globalEventLoop;
            this.cockpitBus = deps.cockpit;

            this.targetPos          = 0;
            this.targetPos_enc      = 0;
            this.mcuTargetPos_enc   = 0;

            this.settings           = {};
            this.encodedSettings    = {};   // Used to work around floating point settings
            this.mcuSettings        = {};

            var self = this;

            this.SyncSettings = new Periodic( 1000, "timeout", function()
            {
                var synced = true;

                // TODO: These should be used at compile time in autogenerated MCU constructors
                // Check latest values from MCU against plugin's desired settings

                // Inversion
                if( self.mcuSettings.inverted !== self.settings.inverted )
                {
                    synced = false;

                    // Send inversion setting request to the MCU
                    var command = 'camServ_inv(' + ( self.settings.inverted ? 1 : 0 ) + ')';
                    self.globalBus.emit( 'mcu.SendCommand', command );
                }

                // Servo speed
                if( self.mcuSettings.speed !== self.encodedSettings.speed )
                {
                    synced = false;

                    // Send speed setting request to the MCU
                    var command = 'camServ_spd(' + self.encodedSettings.speed + ')';
                    self.globalBus.emit( 'mcu.SendCommand', command );
                }

                if( synced )
                {
                    // No need to continue
                    self.SyncSettings.stop();

                    // Enable API now that the MCU settings are updated
                    self.listeners.setTargetPos.enable();
                }
            });

            this.SyncTargetPosition = new Periodic( 33, "timeout", function()
            {
                var synced = true;

                // Send target position to MCU until it responds with affirmation
                if( self.mcuTargetPos_enc !== self.targetPos_enc )
                {
                    synced = false;

                    // Encode floating point position to integer representation
                    var command = 'camServ_tpos(' + self.targetPos_enc + ')';

                    // Emit command to mcu
                    self.globalBus.emit( 'mcu.SendCommand', command );
                }

                if( synced )
                {
                    // No need to continue
                    self.SyncTargetPosition.stop();
                }
            });

            this.listeners = 
            {
                settings: new Listener( this.globalBus, 'settings-change.cameraServo', true, function( settings )
                {
                    // Disable API until MCU sync achieved
                    self.listeners.setTargetPos.disable();

                    // Apply settings
                    self.settings = settings.cameraServo;

                    // Store encoded settings
                    self.encodedSettings.speed = encode( self.settings.speed );

                    // Enable MCU Status listener, if not already enabled
                    self.listeners.mcuStatus.enable();
                    
                    // Emit settings update to cockpit
                    self.cockpitBus.emit( 'plugin.cameraServo.settingsChange', self.settings );

                    // Initiate a sync of the settings with the MCU
                    self.SyncSettings.start();
                }),

                mcuStatus: new Listener( this.globalBus, 'mcu.status', false, function( data )
                {
                    // Servo inversion
                    if( 'camServ_inv' in data )
                    {
                        self.mcuSettings.inverted = ( data.camServ_inv == 1 ? true : false );
                    }

                    // Servo speed
                    if( 'camServ_spd' in data )
                    {
                        self.mcuSettings.speed = data.camServ_spd;
                    }

                    // Servo position
                    if( 'camServ_pos' in data ) 
                    {
                        // Convert from integer to float
                        var angle = decode( data.camServ_pos );

                        // Emit on cockpit bus for UI purposes
                        self.cockpitBus.emit( 'plugin.cameraServo.currentPos', angle );
                    }

                    // Servo target position
                    if( 'camServ_tpos' in data ) 
                    {
                        // Save encoded version for sync validation purposes
                        self.mcuTargetPos_enc = data.camServ_tpos;

                        // Convert from integer to float
                        var angle = decode( data.camServ_tpos );

                        // Emit the real target position on the cockpit bus for UI purposes
                        self.cockpitBus.emit( 'plugin.cameraServo.targetPos', angle );
                    }
                }),

                setTargetPos: new Listener( this.cockpitBus, 'plugin.cameraServo.setTargetPos', false, function( posIn )
                {
                    self.setTargetPos( posIn );
                })
            }
        }

        setTargetPos( posIn )
        {
            var self = this;

            // Apply position limits based on servo's range
            if( posIn > self.settings.rangeMax )
            {
                self.targetPos = self.settings.rangeMax;
            }
            else if( posIn < self.settings.rangeMin )
            {
                self.targetPos = self.settings.rangeMin;
            }
            else
            {
                self.targetPos = posIn;
            }

            self.targetPos_enc = encode( self.targetPos );

            // Start targetPos sync, if not already running
            self.SyncTargetPosition.start();
        }
        
        start()
        {
            this.listeners.settings.enable();
        }

        stop()
        {
            this.listeners.settings.disable();
            this.listeners.mcuStatus.disable();
            this.listeners.setTargetPos.disable();
        }

        getSettingSchema()
        {
            //from http://json-schema.org/examples.html
            return [{
                'title': 'Camera Servo',
                'type': 'object',
                'id': 'cameraServo',
                'properties': {
                    'speed': {
                        'type': 'number',
                        'default': '45.0'
                    },
                    'controlSensitivity': {
                        'type': 'number',
                        'default': '1.0'
                    },
                    'rangeMax': {
                        'type': 'number',
                        'default': '32.8'
                    },
                    'rangeMin': {
                        'type': 'number',
                        'default': '-40.6'
                    },
                    'inverted': {
                    'type': 'boolean',
                    'format': 'checkbox',
                    'default': false
                    },
                    'stepResolution': {
                        'type': 'number',
                        'default': '10.0'
                    }
                    
                },

                // TODO: Need to classify which settings are used at various levels: MCU Model, Local Model, UI model
                'required': [
                    'speed',                // Max speed of servo
                    'controlSensitivity',   // When doing joystick or buttonHeld controls, multiplier against servo speed for moving the targetPos
                    'rangeMax',             // Furthest position in positive direction
                    'rangeMin',             // Furthest position in negative direction
                    'inverted',             // (MCU) Used when remapping angle inputs to microseconds. Unrelated to min and max range
                    'stepResolution'        // (UI)
                ]
            }];
        }
    }


    module.exports = function(name, deps) 
    {
        return new CameraServo(name, deps);
    };
}());