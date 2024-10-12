const _find = require('lodash/fp/find');
const _sample = require('lodash/sample');
const _isEmpty = require('lodash/isEmpty');

const MovieDbSdk = require('../libs/movies');
const LexIntents = require('../libs/lex');
const GenreByMood = require('./mood');

function suggestGenreByMood(mood) {
  const { genre } = _find({ mood }, GenreByMood) || {};
  return _sample(genre);
}

module.exports = {
  GetMovieRecommendation: {
    async handler({ intentRequest, callback }) {
      const { sessionAttributes, currentIntent: { slots, confirmationStatus } } = intentRequest;
      const movie = await MovieDbSdk.getMovieRecommendationsWithFilter(slots);

      switch (confirmationStatus) {
        case 'None':
          // Suggest a movie from the given slots
          return callback(LexIntents.confirm({
            sessionAttributes: {
              posterPath: movie.poster_path,
              movieOverview: movie.overview
            },
            slots,
            intentProperties: {
              intentName: 'GetMovieRecommendation'
            },
            message: {
              contentType: 'PlainText',
              content: `What do you think of ${movie.title}`
            }
          }))
        case 'Denied':
          // Resuggest a movie
          return callback(LexIntents.confirm({
            sessionAttributes: {
              posterPath: movie.poster_path,
              movieOverview: movie.overview
            },
            slots,
            intentProperties: {
              intentName: 'GetMovieRecommendation'
            },
            message: {
              contentType: 'PlainText',
              content: `Hrmmm, how about ${movie.title}`
            }
          }))
        case 'Confirmed':
          // Ask if use wants more information about the movie

          return callback(LexIntents.confirm({
            sessionAttributes,
            slots: {
              movieName: movie.title
            },
            intentProperties: {
              intentName: 'GetMovieInformation'
            },
            message: {
              contentType: 'PlainText',
              content: `Great. Want to hear more about the movie?`
            }
          }))
      }
    },
    hook({ intentRequest, callback }) {
      const { currentIntent, sessionAttributes } = intentRequest;
      const { slots: { celebrity, genre } } = currentIntent;

      if (_isEmpty(celebrity) && _isEmpty(genre)) {
        console.log('\n\n ==> No slots given');
        return callback(LexIntents.elicitSlot({
          sessionAttributes,
          intentProperties: {
            intentName: 'GetMovieRecommendation'
          },
          slots: {
            genre,
            celebrity
          },
          message: {
            contentType: 'PlainText',
            content: 'Which genre are you interested in?'
          },
          slotToElicit: 'genre'
        }))
      }
      else {
        console.log('\n\n ==> Everything all gee mate');
        return callback(LexIntents.delegate({
          sessionAttributes,
          slots: {
            celebrity,
            genre
          }
        }))
      }
    }
  },
  GetMovieInformation: {
    async handler({ intentRequest, callback }) {
      const { sessionAttributes, currentIntent: { slots, confirmationStatus } } = intentRequest;

      switch (confirmationStatus) {
        case 'None':
        case 'Denied':
          return callback(LexIntents.close({
            sessionAttributes,
            fulfillmentState: 'Fulfilled',
            message: {
              contentType: 'PlainText',
              content: 'Okay! No worries.'
            }
          }))
        case 'Confirmed':
          return callback(LexIntents.close({
            sessionAttributes,
            fulfillmentState: 'Fulfilled',
            message: {
              contentType: 'PlainText',
              content: `Here is an overview I found: \n${sessionAttributes.movieOverview}`
            }
          }))
      }
    }
  },
  GetSuggestionFromPreviousResponse: {
    async handler({ intentRequest, callback }) {
      const { sessionAttributes, currentIntent: { confirmationStatus }, userId } = intentRequest;
      const { mood } = sessionAttributes;

      switch(confirmationStatus) {
        case 'Denied':
          const suggestedGenre = suggestGenreByMood(mood);
          return callback((LexIntents.confirm({
            sessionAttributes: {
              mood,
              genre: suggestedGenre
            },
            slots: {
              mood
            },
            intentProperties: {
              intentName: 'GetMovieByMood'
            },
            message: {
              contentType: 'PlainText',
              content: `Okay, how about watching a ${suggestedGenre} movie?`
            }
          })))
        case 'Confirmed':
          // Get movie by genre
          const movie = await MovieDbSdk.getMovieRecommendationsWithFilter({ genre: sessionAttributes.genre });
          try {
          await MovieDbSdk.savePreferences(userId, {
              mood,
              genre: sessionAttributes.genre
          });
          console.log('==> SAVED')
          } catch (err) {
            console.log('==> ERR ', err);
          }

          return callback(LexIntents.confirm({
            sessionAttributes: {
              ...sessionAttributes,
              movieOverview: movie.overview,
              posterPath: movie.poster_path
            },
            slots: {
              genre: sessionAttributes.genre,
              celebrity: null
            },
            intentProperties: {
              intentName: 'GetMovieRecommendation'
            },
            message: {
              contentType: 'PlainText',
              content: `Cool, You should check out ${movie.title}. Keen?`
            }
          }))
      }
    }
  },
  GetMovieByMood: {
    async handler({ intentRequest, callback }) {
      const { sessionAttributes, currentIntent: { slots, confirmationStatus }, userId } = intentRequest;
      let { mood } = slots;
      const suggestedGenre = suggestGenreByMood(mood);

      switch (confirmationStatus) {
        case 'None':
          let content;
          let genreToSuggest = suggestedGenre;
          if (['sad', 'bad', 'unhappy', 'annoyed', 'moody'].includes(mood)) {
            mood = 'sad';
            content = `Aww. Let's watch a movie to take your mind off things. How about a movie in the ${suggestedGenre} genre. Up for it?`;
          }
          else if (mood === 'happy') {
            content = `That's good to hear. Lets chill and watch a movie. I would suggests a movie in the ${suggestedGenre} genre. Up for it?`;
          }
          else {
            content = `Let's watch a movie and chill. I'd suggest a movie in the ${suggestedGenre} genre. What do you think?`
          }

          // Get new genre based on mood
          const { preferences} = await MovieDbSdk.getUserPreferences(userId);

          if (preferences && preferences.mood) {
            const { mood: moodPreferences } = preferences;
            const  preferencesForMood = moodPreferences.filter(preference => preference.mood === mood);
            if (!_isEmpty(preferencesForMood)) {
              console.log('====>> PREFERNCES FOR MOOD', preferencesForMood)
              const { genre: suggestedGenreFromPrerences } = _sample(preferencesForMood);
              content = `When you were ${mood} last time, you preferred a movie in the ${suggestedGenreFromPrerences} genre. Would you like to watch a movie from that genre again?`
              genreToSuggest = suggestedGenreFromPrerences
            }
          }
          console.log('==> genre to suggest', genreToSuggest)
          return callback((LexIntents.confirm({
            sessionAttributes: {
              mood,
              genre: genreToSuggest
            },
            slots: {
              mood
            },
            intentProperties: {
              intentName: 'GetMovieByMood'
            },
            message: {
              contentType: 'PlainText',
              content
            }
          })))
        case 'Denied':
          // Get new genre based on mood
          return callback((LexIntents.confirm({
            sessionAttributes: {
              mood,
              genre: suggestedGenre
            },
            slots: {
              mood
            },
            intentProperties: {
              intentName: 'GetMovieByMood'
            },
            message: {
              contentType: 'PlainText',
              content: `Okay, how about watching a ${suggestedGenre} movie?`
            }
          })))
        case 'Confirmed':
          // Get movie by genre
          const movie = await MovieDbSdk.getMovieRecommendationsWithFilter({ genre: sessionAttributes.genre });
          try {
          await MovieDbSdk.savePreferences(userId, {
              mood,
              genre: sessionAttributes.genre
          });
          console.log('==> SAVED')
          } catch (err) {
            console.log('==> ERR ', err);
          }

          return callback(LexIntents.confirm({
            sessionAttributes: {
              ...sessionAttributes,
              movieOverview: movie.overview,
              posterPath: movie.poster_path
            },
            slots: {
              genre: sessionAttributes.genre,
              celebrity: null
            },
            intentProperties: {
              intentName: 'GetMovieRecommendation'
            },
            message: {
              contentType: 'PlainText',
              content: `Cool, You should check out ${movie.title}. Keen?`
            }
          }))
      }
    },
    hook({ intentRequest, callback }) {
      const { currentIntent, sessionAttributes } = intentRequest;
      const { slots: { mood } } = currentIntent;

      if (_isEmpty(mood) || !_find({ mood }, GenreByMood)) {
        console.log('\n\n ==> No slots given');
        return callback(LexIntents.elicitSlot({
          sessionAttributes,
          intentProperties: {
            intentName: 'GetMovieByMood'
          },
          slots: {
            mood: null
          },
          message: {
            contentType: 'PlainText',
            content: `Sorry, I didn\'t quite get that. How do you feel today?`
          },
          slotToElicit: 'mood'
        }))
      }
      else {
        console.log('\n\n ==> Everything all gee mate');
        return callback(LexIntents.delegate({
          sessionAttributes,
          slots: {
            mood
          }
        }))
      }
    }
  }
}
