import { createRouter, createWebHistory } from 'vue-router';
import CatalogPage from './CatalogPage.vue';
import OwnerSchedule from './owner/OwnerSchedule.vue';
import MeetingTypes from './owner/MeetingTypes.vue';
import GuestPage from './GuestPage.vue';
import OwnerLayout from './owner/OwnerLayout.vue';
import OwnerLogin from './owner/OwnerLogin.vue';
import OwnerBookings from './owner/OwnerBookings.vue';
import ConfirmationPage from './ConfirmationPage.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: GuestPage },
    { path: '/confirmations/:token', component: ConfirmationPage },
    { path: '/book', component: CatalogPage },
    { path: '/book/:id', component: CatalogPage },
    { path: '/owner/login', component: OwnerLogin },
    {
      path: '/owner',
      component: OwnerLayout,
      children: [
        { path: '', redirect: '/owner/bookings' },
        { path: 'bookings', component: OwnerBookings, meta: { title: 'Встречи' } },
        { path: 'meeting-types', component: MeetingTypes, meta: { title: 'Типы встреч' } },
        { path: 'schedule', component: OwnerSchedule, meta: { title: 'Расписание' } },
      ],
    },
  ],
});
