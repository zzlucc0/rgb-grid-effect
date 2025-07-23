class MusicAPI {
    constructor(audioContext) {
        this.audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
        this.apiKey = ""; // Empty API key placeholder
        
        // Jamendo API configuration
        this.jamendoClientId = "f2e5b0c6"; // Test client ID, replace with your own
        this.jamendoApiUrl = "https://api.jamendo.com/v3.0";
        
        // Free Music Archive API
        this.fmaApiUrl = "https://freemusicarchive.org/api";
        
        // Audio cache for loaded tracks
        this.audioCache = {};
        
        // Currently playing track information
        this.currentTrack = null;
        
        // Initialize
        this.init();
    }
    
    init() {
        console.log("MusicAPI initialized");
    }

    /**
     * Search songs - Uses multiple music APIs
     */
    async searchSong(query) {
        const searchResults = document.getElementById("searchResults");
        const startButton = document.getElementById("startGame");
        
        searchResults.innerHTML = "<div class=\"loading-message\">Searching for songs...</div>";
        
        try {
            // Search for tracks using Jamendo API
            const jamendoResults = await this.searchJamendo(query);
            
            // If Jamendo returns no results, we could search using other APIs
            // For future expansion, uncomment: const ccMixterResults = await this.searchCcMixter(query);
            
            searchResults.innerHTML = "";
            
            // Display Jamendo results
            if (jamendoResults && jamendoResults.length > 0) {
                // Source title
                const sourceTitle = document.createElement("div");
                sourceTitle.className = "source-title";
                sourceTitle.textContent = "Jamendo Music";
                searchResults.appendChild(sourceTitle);
                
                // Create result items
                jamendoResults.forEach(track => {
                    const resultDiv = document.createElement("div");
                    resultDiv.className = "song-result";
                    
                    // Format duration
                    const minutes = Math.floor(track.duration / 60);
                    const seconds = Math.floor(track.duration % 60);
                    const formattedDuration = `${minutes}:${seconds.toString().padStart(2, "0")}`;
                    
                    resultDiv.innerHTML = `
                        <div class="song-info">
                            <div class="song-title">${track.name}</div>
                            <div class="song-artist">${track.artist_name}</div>
                            <div class="song-details">
                                <span class="song-duration">${formattedDuration}</span>
                                <span class="song-genre">${track.genre || ""}</span>
                            </div>
                        </div>
                    `;
                    
                    resultDiv.addEventListener("click", () => this.loadOnlineSong(track));
                    searchResults.appendChild(resultDiv);
                });
                
                return jamendoResults;
            } else {
                searchResults.innerHTML = "<div class=\"info-message\">No songs found matching your search, please try a different query</div>";
                return [];
            }
        } catch (error) {
            console.error("Error searching songs:", error);
            searchResults.innerHTML = "<div class=\"error-message\">Error searching for songs, please try again</div>";
            return [];
        }
    }

    /**
     * Search for tracks on Jamendo
     */
    async searchJamendo(query) {
        try {
            // Construct Jamendo API search URL
            const searchUrl = `${this.jamendoApiUrl}/tracks/?client_id=${this.jamendoClientId}&format=json&limit=10&namesearch=${encodeURIComponent(query)}`;
            
            const response = await fetch(searchUrl);
            if (!response.ok) {
                throw new Error(`Jamendo API responded with status: ${response.status}`);
            }
            
            const data = await response.json();
            
            // Format the track results
            if (data && data.results && data.results.length > 0) {
                return data.results.map(track => ({
                    id: track.id,
                    name: track.name,
                    artist_name: track.artist_name,
                    duration: track.duration,
                    audio_url: track.audio,
                    genre: track.genre,
                    source: "jamendo",
                    stream_url: track.audio // Direct stream URL from Jamendo
                }));
            }
            
            return [];
        } catch (error) {
            console.error("Error searching Jamendo:", error);
            // Return empty array in case of error to continue without crashing the app
            return [];
        }
    }
    
    /**
     * Load selected song
     */
    async loadSong(track) {
        const startButton = document.getElementById("startGame");
        const searchResults = document.getElementById("searchResults");
        
        try {
            if (!track || !track.stream_url) {
                throw new Error("Invalid track or missing stream URL");
            }

            searchResults.innerHTML = "<div class=\"loading-message\">Loading song...</div>";
            
            // Check if the song is already in cache
            if (this.audioCache[track.id]) {
                console.log("Using cached audio for:", track.name);
                
                // Update current track
                this.currentTrack = track;
                
                // Enable start button
                startButton.disabled = false;
                searchResults.innerHTML = `<div class="success-message">Selected: ${track.name}</div>`;
                
                // Return the cached audio element
                return this.audioCache[track.id];
            }
            
            console.log("Loading audio URL:", track.stream_url);
            
            // Create new audio element (with cross-origin support)
            const audio = new Audio();
            audio.crossOrigin = "anonymous";
            audio.src = track.stream_url;
            
            // Wait for audio to be ready
            await new Promise((resolve, reject) => {
                audio.addEventListener("canplay", resolve);
                audio.addEventListener("error", () => reject(new Error("Failed to load audio")));
                
                // Set timeout
                const timeout = setTimeout(() => {
                    reject(new Error("Audio loading timed out"));
                }, 20000); // 20 seconds timeout
                
                // Clear timeout
                audio.addEventListener("canplay", () => clearTimeout(timeout));
            });
            
            // Store in cache
            this.audioCache[track.id] = audio;
            
            // Update current track
            this.currentTrack = track;
            
            // Enable start button
            startButton.disabled = false;
            searchResults.innerHTML = `<div class="success-message">Selected: ${track.name}</div>`;
            
            return audio;
        } catch (error) {
            console.error("Error loading song:", error);
            searchResults.innerHTML = "<div class=\"error-message\">Failed to load song, please try again</div>";
            startButton.disabled = true;
            return null;
        }
    }
    
    /**
     * Load song from online sources (loaded directly from API results)
     */
    async loadOnlineSong(track) {
        const startButton = document.getElementById("startGame");
        const searchResults = document.getElementById("searchResults");
        const game = window.game; // Access to the global game instance
        
        try {
            // Check if track has valid stream URL
            if (!track || !track.stream_url) {
                throw new Error("Invalid track");
            }
            
            // Show loading message
            searchResults.innerHTML = `<div class="loading-message">Loading: ${track.name} - ${track.artist_name}...</div>`;
            
            // Check if audio is already cached
            if (this.audioCache[track.id]) {
                console.log("Using cached audio for:", track.name);
                
                // Update current track
                this.currentTrack = track;
                
                // Enable start button
                startButton.disabled = false;
                searchResults.innerHTML = `<div class="success-message">Selected: ${track.name} - ${track.artist_name}</div>`;
                
                return;
            }
            
            // Create new audio element and load track
            const audio = new Audio();
            audio.crossOrigin = "anonymous";
            audio.src = track.stream_url;
            
            // Wait for the audio to be ready to play
            await new Promise((resolve, reject) => {
                audio.addEventListener("canplay", resolve);
                audio.addEventListener("error", () => reject(new Error("Failed to load audio")));
                
                // Set timeout
                const timeout = setTimeout(() => {
                    reject(new Error("Audio loading timed out"));
                }, 20000); // 20 seconds timeout
                
                // Clear timeout
                audio.addEventListener("canplay", () => clearTimeout(timeout));
            });
            
            // Store in cache
            this.audioCache[track.id] = audio;
            
            // Update current track
            this.currentTrack = track;
            
            // Enable start button
            startButton.disabled = false;
            searchResults.innerHTML = `<div class="success-message">Selected: ${track.name} - ${track.artist_name}</div>`;
            
        } catch (error) {
            console.error("Error loading online song:", error);
            searchResults.innerHTML = "<div class=\"error-message\">Failed to load song, please try again</div>";
            startButton.disabled = true;
        }
    }

    /**
     * Get information about the current track
     */
    getCurrentTrackInfo() {
        return this.currentTrack;
    }
    
    /**
     * Clear the audio cache and current track
     */
    clearCache() {
        this.audioCache = {};
        this.currentTrack = null;
    }
    
    /**
     * Get recommended tracks (popular electronic tracks)
     */
    async getRecommendedTracks() {
        const searchResults = document.getElementById("searchResults");
        
        try {
            // Set up Jamendo API request URL - for popular electronic tracks
            const recommendUrl = `${this.jamendoApiUrl}/tracks/?client_id=${this.jamendoClientId}&format=json&limit=10&boost=popularity_total&fuzzytags=electronic`;
            
            const response = await fetch(recommendUrl);
            if (!response.ok) {
                throw new Error(`Jamendo API responded with status: ${response.status}`);
            }
            
            const data = await response.json();
            
            searchResults.innerHTML = "";
            
            // Process the results
            if (data && data.results && data.results.length > 0) {
                // Add title header
                const sourceTitle = document.createElement("div");
                sourceTitle.className = "source-title";
                sourceTitle.textContent = "Recommended Tracks";
                searchResults.appendChild(sourceTitle);
                
                // Create result items
                data.results.forEach(track => {
                    const resultDiv = document.createElement("div");
                    resultDiv.className = "song-result";
                    
                    // Format duration
                    const minutes = Math.floor(track.duration / 60);
                    const seconds = Math.floor(track.duration % 60);
                    const formattedDuration = `${minutes}:${seconds.toString().padStart(2, "0")}`;
                    
                    resultDiv.innerHTML = `
                        <div class="song-info">
                            <div class="song-title">${track.name}</div>
                            <div class="song-artist">${track.artist_name}</div>
                            <div class="song-details">
                                <span class="song-duration">${formattedDuration}</span>
                                <span class="song-genre">${track.genre || ""}</span>
                            </div>
                        </div>
                    `;
                    
                    // Format track for consistent handling
                    const formattedTrack = {
                        id: track.id,
                        name: track.name,
                        artist_name: track.artist_name,
                        duration: track.duration,
                        audio_url: track.audio,
                        genre: track.genre,
                        source: "jamendo",
                        stream_url: track.audio
                    };
                    
                    resultDiv.addEventListener("click", () => this.loadOnlineSong(formattedTrack));
                    searchResults.appendChild(resultDiv);
                });
                
                return data.results;
            } else {
                searchResults.innerHTML = "<div class=\"info-message\">No recommendations available, please try searching instead</div>";
                return [];
            }
        } catch (error) {
            console.error("Error getting recommended tracks:", error);
            searchResults.innerHTML = "<div class=\"error-message\">Failed to load recommendations, please try again</div>";
            return [];
        }
    }
}

// Export the API to the global scope
window.MusicAPI = MusicAPI;
