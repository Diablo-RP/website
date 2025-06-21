(function ($) {
	
	"use strict";

	// Page loading animation
	$(window).on('load', function() {

        $('#js-preloader').addClass('loaded');

    });


	$(window).scroll(function() {
	  var scroll = $(window).scrollTop();
	  var box = $('.header-text').height();
	  var header = $('header').height();

	  if (scroll >= box - header) {
	    $("header").addClass("background-header");
	  } else {
	    $("header").removeClass("background-header");
	  }
	})

	var width = $(window).width();
		$(window).resize(function() {
		if (width > 767 && $(window).width() < 767) {
			location.reload();
		}
		else if (width < 767 && $(window).width() > 767) {
			location.reload();
		}
	})

	const elem = document.querySelector('.trending-box');
	const filtersElem = document.querySelector('.trending-filter');
	if (elem) {
		const rdn_events_list = new Isotope(elem, {
			itemSelector: '.trending-items',
			layoutMode: 'masonry'
		});
		if (filtersElem) {
			filtersElem.addEventListener('click', function(event) {
				if (!matchesSelector(event.target, 'a')) {
					return;
				}
				const filterValue = event.target.getAttribute('data-filter');
				rdn_events_list.arrange({
					filter: filterValue
				});
				filtersElem.querySelector('.is_active').classList.remove('is_active');
				event.target.classList.add('is_active');
				event.preventDefault();
			});
		}
	}


	// Menu Dropdown Toggle
	if($('.menu-trigger').length){
		$(".menu-trigger").on('click', function() {	
			$(this).toggleClass('active');
			$('.header-area .nav').slideToggle(200);
		});
	}


	// Menu elevator animation
	$('.scroll-to-section a[href*=\\#]:not([href=\\#])').on('click', function() {
		if (location.pathname.replace(/^\//,'') == this.pathname.replace(/^\//,'') && location.hostname == this.hostname) {
			var target = $(this.hash);
			target = target.length ? target : $('[name=' + this.hash.slice(1) +']');
			if (target.length) {
				var width = $(window).width();
				if(width < 991) {
					$('.menu-trigger').removeClass('active');
					$('.header-area .nav').slideUp(200);	
				}				
				$('html,body').animate({
					scrollTop: (target.offset().top) - 80
				}, 700);
				return false;
			}
		}
	});


	// Page loading animation
	$(window).on('load', function() {
		if($('.cover').length){
			$('.cover').parallax({
				imageSrc: $('.cover').data('image'),
				zIndex: '1'
			});
		}

		$("#preloader").animate({
			'opacity': '0'
		}, 600, function(){
			setTimeout(function(){
				$("#preloader").css("visibility", "hidden").fadeOut();
			}, 300);
		});
	});
    


})(window.jQuery);

// Clips for Hammerrazor
const clipsHammerrazor = [
  "https://clips.twitch.tv/embed?clip=NastyVastDragonfruitFUNgineer-TaAW5YtjIykhnG8e&parent=diablo-rp.github.io",
  "https://clips.twitch.tv/embed?clip=AbrasiveRacySquidDogFace-yl3Kdww5Iu1s-rDr&parent=diablo-rp.github.io"
];

// Clips for Dopeydyl
const clipsDopeydyl = [
  "https://clips.twitch.tv/embed?clip=YummyHelpfulSangChocolateRain-7SZrD1N9KQTEV39E&parent=diablo-rp.github.io",
  "https://clips.twitch.tv/embed?clip=AmazingBusySlothBabyRage-XyKyrhJwuTYk-Js9&parent=diablo-rp.github.io"
];

// Comment out unused Twitch code
/*
function loadRandomClipForStreamer(clipArray, iframeId, streamerNameId, twitchLinkId, twitchUrl) {
  const randomClip = clipArray[Math.floor(Math.random() * clipArray.length)];
  document.getElementById(iframeId).src = randomClip;
  document.getElementById(streamerNameId).innerText = twitchUrl.split('/').pop();
  document.getElementById(twitchLinkId).href = twitchUrl;
}

// Load random clips for each streamer
loadRandomClipForStreamer(clipsHammerrazor, 'twitch-clip-hammerrazor', 'streamer-name-hammerrazor', 'twitch-link-hammerrazor', 'https://www.twitch.tv/hammerrazor');
loadRandomClipForStreamer(clipsDopeydyl, 'twitch-clip-dopeydyl', 'streamer-name-dopeydyl', 'twitch-link-dopeydyl', 'https://www.twitch.tv/dopeydyl');
*/
